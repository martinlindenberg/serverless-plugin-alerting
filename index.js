'use strict';

module.exports = function(S) {

    const AWS      = require('aws-sdk'),
        SCli       = require(S.getServerlessPath('utils/cli')),
        fs         = require('fs'),
        BbPromise  = require('bluebird'); // Serverless uses Bluebird Promises and we recommend you do to because they provide more than your average Promise :)

    class ServerlessPluginAlerting extends S.classes.Plugin {
        constructor(S) {
            super(S);
        }

        static getName() {
            return 'com.serverless.' + ServerlessPluginAlerting.name;
        }

        registerHooks() {

            S.addHook(this._addAlertsAfterDeploy.bind(this), {
                action: 'functionDeploy',
                event:  'post'
            });
            S.addHook(this._addAlertsAfterDeploy.bind(this), {
                action: 'dashDeploy',
                event:  'post'
            });

            return BbPromise.resolve();
        }

        /**
         * adds alerts after the deployment of a function
         *
         * @param object evt
         *
         * @return promise
         */
        _addAlertsAfterDeploy(evt) {
            let _this = this;

            return new BbPromise(function(resolve, reject) {
                for(var region in evt.data.deployed) {
                    _this._manageAlerts(evt, region);
                }

                return resolve(evt);
            });
        }

        /**
         * Handles the Creation of an alert and the required topics
         *
         * @param object evt Event
         * @param string region
         *
         * @return promise
         */
        _manageAlerts (evt, region) {
            let _this = this;


            _this.stage = evt.options.stage;
            _this._initAws(region);

            if (S.cli.action != 'deploy' || (S.cli.context != 'function' && S.cli.context != 'dash'))
                return;

            var functionAlertSettings = _this._getFunctionsAlertSettings(evt, region);

            // no alert.json found
            if (functionAlertSettings.length == 0) {
                return;
            }

            var requiredTopics = _this._getRequiredTopics(functionAlertSettings);

            return _this._createTopics(requiredTopics)
            .then(function(){
                // topics exist now
                let _this = this;

                var alertPromises = _this._createAlerts(functionAlertSettings, _this);

                BbPromise.all(alertPromises)
                .then(function(){
                    console.log('alerts created');
                });
            }.bind(_this))
            .catch(function(e){
                SCli.log('error in creating alerts', e)
            });
        }

        /**
         * creates alerts for the function
         *
         * @param array functionAlertSettings List of settings for each deployed function
         * @param object _this as this function returns an array, i can not use _createAlerts(a,b).bind(_this) to attach a pointer to _this
         *
         * @return array
         */
        _createAlerts (functionAlertSettings, _this) {

            var alertActions = [];

            for (var i in functionAlertSettings) {
                var alertContents = functionAlertSettings[i];

                for (var j in alertContents) {
                    var alertContent = alertContents[j];

                    // only if there is a sns topic
                    if (!alertContent.notificationTopicStageMapping[_this.stage]) {
                        continue;
                    }

                    var notificationAction = _this._getNotificationActionByArn(
                        alertContent.Arn,
                        alertContent.notificationTopicStageMapping,
                        _this.stage
                    );

                    var functionName = _this._getFunctionNameByArn(alertContent.Arn, _this.stage);

                    for (var metricname in alertContent.alerts) {
                        var topicName = alertContent.notificationTopicStageMapping[_this.stage];

                        alertActions.push(
                            _this.cloudWatch.putMetricAlarmAsync(
                                _this._getAlarmConfig(functionName, metricname, alertContent.alerts[metricname], _this.stage, topicName, notificationAction)
                            )
                        );
                    }
                }
            }

            return alertActions;
        }

        /**
         * creates topics if not yet done
         *
         * @param array topics
         *
         * @return BpPromise
         */
        _createTopics (topics) {
            var _this = this;
            _this.topics = topics;

            return _this.sns.listTopicsAsync()
            .then(function(topicListResult){
                var _this = this;
                //create fast checkable topiclist['topic1'] = 'topic1'
                var topicList = [];
                if (topicListResult['Topics']) {
                    for (var i in topicListResult.Topics) {
                        var arnParts = topicListResult.Topics[i].TopicArn.split(':')
                        var topicName = arnParts[arnParts.length - 1];
                        topicList[topicName] = topicName;
                    }
                }

                for (var i in this.topics) {
                    if (!topicList[i]) {
                        console.log('topic ' + i + ' does not exist. it will be created now');
                        _this.sns.createTopicAsync({
                            'Name': i
                        })
                        .then(function(){
                            console.log('topic created');
                        })
                        .catch(function(e){
                            console.log('error during creation of the topic !', e)
                        });
                    } else {
                        console.log('topic ' + i + ' exists.');
                    }
                }
            }.bind(this));
        }

        /**
         * initializes aws
         *
         * @param string region
         *
         * @return void
         */
        _initAws (region) {
            let _this = this,
                credentials = S.getProvider('aws').getCredentials(_this.stage, region);

            _this.cloudWatch = new AWS.CloudWatch({
                region: region,
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey
            });

            _this.sns = new AWS.SNS({
                region: region,
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey
            });

            BbPromise.promisifyAll(_this.cloudWatch);
            BbPromise.promisifyAll(_this.sns);
        }

        /**
         * finds the topics for the function
         *
         * @param array functionAlertSettings
         *
         * @return array
         */
        _getRequiredTopics(functionAlertSettings) {
            let _this = this;
            var topics = [];

            for (var i in functionAlertSettings) {
                var alertContents = functionAlertSettings[i];

                for (var j in alertContents) {
                    var alertContent = alertContents[j];

                    // only if there is a sns topic
                    if (!alertContent.notificationTopicStageMapping[_this.stage]) {
                        continue;
                    }

                    topics[alertContent.notificationTopicStageMapping[_this.stage]] = alertContent.notificationTopicStageMapping[_this.stage];
                }
            }

            return topics;
        }

        /**
         * parses the alert json file and returns the data
         *
         * @param object evt
         * @param string region
         *
         * @return array
         */
        _getFunctionsAlertSettings(evt, region){
            let _this = this;
            var settings = [];
            for (var deployedIndex in evt.data.deployed[region]) {
                let deployed = evt.data.deployed[region][deployedIndex],
                    functionName = deployed['functionName'],
                    alertPathFile = S.config.projectPath + '/' + functionName + '/alerting.json';

                if (!fs.existsSync(alertPathFile)) {
                    continue;
                }

                try {
                    var alertContents = JSON.parse(fs.readFileSync(alertPathFile));

                    if (!alertContents.length > 0) {
                        alertContents = [alertContents];
                    }

                    for (var i in alertContents) {
                        alertContents[i].Arn = deployed.Arn;
                    }

                    settings.push(alertContents);
                } catch (e) {
                    console.log('alerting.json not readable');
                    continue;
                }
            }

            return settings;
        }


        /**
         * @deprecated
         */
        _getFunctionNameByArn(arn, stage) {
            return arn.split(':function:')[1].replace(':' + stage, '');
        }

        /**
         * set the NotificationAction by ARN
         *
         * @param string arn ARN of the function
         * @param array map Notificationtopic mapping
         * @param string stage
         *
         *
         * @param void
         */
        _getNotificationActionByArn(arn, map, stage) {
            var name = arn.split(':function:')[0].replace(':lambda:', ':sns:');
            return name + ':' + map[stage];
        }

        /**
         * returns config object for the sns command
         *
         * @param string functionname
         * @param string metric
         * @param object alertConfig
         * @param string stage
         * @param string topicName
         * @param string notificationAction
         *
         * @return object
         */
        _getAlarmConfig(functionName, metric, alertConfig, stage, topicName, notificationAction) {
            let resourceName = functionName + ":" + stage;

            return {
                AlarmName: resourceName + ' ' + metric + ' -> ' + topicName,
                ComparisonOperator: alertConfig.comparisonOperator,
                EvaluationPeriods: alertConfig.evaluationPeriod,
                MetricName: metric,
                Namespace: alertConfig.alarmNamespace,
                Period: alertConfig.alarmPeriod,
                Statistic: alertConfig.alarmStatisticType,
                Threshold: alertConfig.alarmThreshold,
                AlarmDescription: alertConfig.description,
                Dimensions: [
                    { Name: "Resource", Value: resourceName },
                    { Name: "FunctionName", Value: functionName }
                ],
                InsufficientDataActions: [notificationAction],
                OKActions: [notificationAction],
                AlarmActions: [notificationAction]
            };
        }
    }

    return ServerlessPluginAlerting;
};
