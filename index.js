'use strict';

module.exports = function(S) {

    const AWS      = require('aws-sdk'),
        SCli       = require(S.getServerlessPath('utils/cli')),
        SUtils     = require(S.getServerlessPath('utils')),
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
            _this.region = region;
            _this._initAws(region);

            if (S.cli.action != 'deploy' || (S.cli.context != 'function' && S.cli.context != 'dash'))
                return;

            // merges global and local alertsettings
            var alertSettings = _this._mergeAlertSettings([
                _this._getFunctionsAlertSettings(evt, region),
                _this._getProjectAlertSettings(evt, region),
            ]);

            // no settings found
            if (alertSettings.length == 0) {
                return;
            }

            var requiredTopics = _this._getRequiredTopics(alertSettings);

            return _this._createTopics(requiredTopics)
            .then(function(){
                // topics exist now
                let _this = this;

                var metricFilterPromises = _this._createMetricFilters(alertSettings, _this)
                var subscriptionFilterPromises = _this._createSubscriptionFilters(alertSettings, _this);
                var alertPromises = _this._createAlerts(alertSettings, _this);

                if (metricFilterPromises.length > 0) {
                    BbPromise.all(metricFilterPromises)
                    .then(function(){
                        console.log('metric filters created');
                    });
                }

                if (subscriptionFilterPromises.length > 0) {
                    BbPromise.all(subscriptionFilterPromises)
                    .then(function(){
                        console.log('subscription filters created');
                    });
                }

                if(alertPromises.length > 0) {
                    BbPromise.all(alertPromises)
                    .then(function(){
                        console.log('alerts created');
                    });
                }

            }.bind(_this))
            .catch(function(e){
                console.log('e', e)
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
            var alertNamesProcessed = [];

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
                        if (topicName.indexOf('arn:aws:sns:') >= 0) {
                            var parts = topicName.split(':');
                            topicName = parts[parts.length - 1];
                        }

                        var alertConfig = _this._getAlarmConfig(functionName, metricname, alertContent.alerts[metricname], _this.stage, topicName, notificationAction);

                        if (alertNamesProcessed.indexOf(alertConfig.AlarmName) === -1) {
                            alertNamesProcessed.push(alertConfig.AlarmName);
                            alertActions.push(
                                _this.aws.request('CloudWatch', 'putMetricAlarm', alertConfig, _this.stage, _this.region)
                            );

                        } else
                            console.log('skipping \''+alertConfig.AlarmName+'\', alerting.json has overriding settings.')
                    }
                }
            }

            return alertActions;
        }

        /**
         * creates metric filters for the function
         *
         * @param array functionAlertSettings List of settings for each deployed function
         * @param object _this as this function returns an array, i can not use _createMetricFilters(a,b).bind(_this) to attach a pointer to _this
         *
         * @return array
         */
        _createMetricFilters (functionAlertSettings, _this) {

            var metricFilterActions = [];

            for (var i in functionAlertSettings) {
                var alertContents = functionAlertSettings[i];
                for (var j in alertContents) {
                    var alertContent = alertContents[j];
                    if (!alertContent.metricFilters) {
                        console.log('no metric filters defined');
                        return [];
                    }
                    var functionName = _this._getFunctionNameByArn(alertContent.Arn, _this.stage);
                    var logGroupName = '/aws/lambda/' + functionName;

                    for (var metricfilter in alertContent.metricFilters) {
                        alertContent.metricFilters[metricfilter].filterName = logGroupName + '_' + metricfilter;
                        alertContent.metricFilters[metricfilter].logGroupName = logGroupName;
                        alertContent.metricFilters[metricfilter].metricTransformations.forEach(function (transformation, index) {
                            if(!transformation.metricNamespace) {
                                transformation.metricNamespace = functionName;
                            }
                        });
                        metricFilterActions.push(
                            _this.aws.request('CloudWatchLogs', 'putMetricFilter', alertContent.metricFilters[metricfilter], _this.stage, _this.region)
                        );
                    }
                }
            }
            return metricFilterActions;
        }

        /**
         * creates subscription filters for the function
         *
         * @param array functionAlertSettings List of settings for each deployed function
         * @param object _this as this function returns an array, i can not use _createsubscriptionFilters(a,b).bind(_this) to attach a pointer to _this
         *
         * @return array
         */
        _createSubscriptionFilters (functionAlertSettings, _this) {
            var subscriptionFilterActions = [];

            for (var i in functionAlertSettings) {
                var alertContents = functionAlertSettings[i];
                for (var j in alertContents) {
                    var alertContent = alertContents[j];
                    if (!alertContent.subscriptionFilters) {
                        console.log('no subscription filters defined');
                        return [];
                    }
                    var functionName = _this._getFunctionNameByArn(alertContent.Arn, _this.stage);
                    var logGroupName = '/aws/lambda/' + functionName;

                    for (var subscriptionFilter in alertContent.subscriptionFilters) {
                        alertContent.subscriptionFilters[subscriptionFilter].filterName = subscriptionFilter;
                        alertContent.subscriptionFilters[subscriptionFilter].logGroupName = logGroupName;
                        subscriptionFilterActions.push(
                            _this.aws.request('CloudWatchLogs', 'putSubscriptionFilter', alertContent.subscriptionFilters[subscriptionFilter], _this.stage, _this.region)
                        );
                    }
                }
            }
            return subscriptionFilterActions;
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

            return _this.aws.request('SNS', 'listTopics', {}, _this.stage, _this.region)
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
                        _this.aws.request('SNS', 'createTopic', {'Name': i}, _this.stage, _this.region)
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
            let _this = this;
            _this.aws = S.getProvider('aws');
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

                    var topicName = alertContent.notificationTopicStageMapping[_this.stage];

                    // ignore existing topics
                    if (topicName.indexOf('arn:aws:sns:') >= 0) {
                        continue;
                    }

                    topics[topicName] = topicName;
                }
            }

            return topics;
        }

        /**
         * receives a list of settings and merges them (AND-Connected)
         *
         * @param array settingsList
         *
         * @return array
         */
        _mergeAlertSettings(settingsList){
            var result = [];

            for (var i in settingsList) {
                for (var j in settingsList[i]) {
                    result.push(settingsList[i][j]);
                }
            }

            return result;
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
                var deployed = evt.data.deployed[region][deployedIndex],
                    functionName = deployed['functionName'],
                    alertPathFile = S.getProject().getFunction(functionName).getFilePath().replace('s-function.json', 'alerting.json');

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

            return SUtils.populate(S.getProject(), {}, settings, evt.options.stage, region);
        }

        /**
         * parses the global alert josn file and returns data
         *
         * @param object evt
         * @param string region
         *
         * @return array
         */
        _getProjectAlertSettings(evt, region){
            let _this = this;
            var settings = [];

            var globalAlertFile = S.getProject().getRootPath('global-alerting.json');

            if (!fs.existsSync(globalAlertFile)) {
                return settings;
            }
            try {
                // each deployed function receives its alert settings
                for (var deployedIndex in evt.data.deployed[region]) {
                    var deployed = evt.data.deployed[region][deployedIndex];
                    var alertContents = JSON.parse(fs.readFileSync(globalAlertFile));

                    if (!alertContents.length > 0) {
                        alertContents = [alertContents];
                    }

                    for (var i in alertContents) {
                        alertContents[i].Arn = deployed.Arn;
                    }

                    settings.push(alertContents);
                }
            } catch (e) {
                console.log('global-alerting.json not readable');
            }

            return SUtils.populate(S.getProject(), {}, settings, evt.options.stage, region);
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
            var actionName = map[stage];
            if (actionName.indexOf('arn:aws:sns:') >= 0) {
                return actionName;
            }

            var name = arn.split(':function:')[0].replace(':lambda:', ':sns:');
            return name + ':' + actionName;
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
            let metricName = metric;
            if('metricName' in alertConfig) {
                metricName = alertConfig.metricName;
            }
            let dimensions = [{ Name: "Resource", Value: resourceName },
                              { Name: "FunctionName", Value: functionName }
                             ];
            if('dimensions' in alertConfig) {
                dimensions = alertConfig.dimensions;
            }
            var config = {
                AlarmName: resourceName + ' ' + metric + ' -> ' + topicName,
                ActionsEnabled: alertConfig.enabled || true,
                ComparisonOperator: alertConfig.comparisonOperator,
                EvaluationPeriods: alertConfig.evaluationPeriod,
                MetricName: metricName,
                Namespace: alertConfig.alarmNamespace,
                Period: alertConfig.alarmPeriod,
                Statistic: alertConfig.alarmStatisticType,
                Threshold: alertConfig.alarmThreshold,
                AlarmDescription: alertConfig.description,
                Dimensions: dimensions
            };

            if (!('assignedActions' in alertConfig)) {
                alertConfig['assignedActions'] = [
                    'InsufficientData',
                    'OK',
                    'Alarm'
                ];
            }

            for (var i in alertConfig['assignedActions']) {
                var key = alertConfig['assignedActions'][i] + 'Actions';
                config[key] = [notificationAction];
            }

            return config;
        }
    }

    return ServerlessPluginAlerting;
};
