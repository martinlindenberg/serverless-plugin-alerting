'use strict';

module.exports = function(SPlugin) {

    const AWS      = require('aws-sdk'),
        path       = require('path'),
        fs         = require('fs'),
        BbPromise  = require('bluebird'); // Serverless uses Bluebird Promises and we recommend you do to because they provide more than your average Promise :)

    class ServerlessPluginAlerting extends SPlugin {
        constructor(S) {
            super(S);
        }

        static getName() {
            return 'com.serverless.' + ServerlessPluginAlerting.name;
        }

        registerHooks() {
            this.S.addHook(this._addAlertsAfterDeploy.bind(this), {
                action: 'functionDeploy',
                event:  'post'
            });
            this.S.addHook(this._addAlertsAfterDeploy.bind(this), {
                action: 'dashDeploy',
                event:  'post'
            });

            return BbPromise.resolve();
        }

        _addAlertsAfterDeploy(evt) {
            let _this = this;

            return new BbPromise(function(resolve, reject) {
                for(var region in evt.data.deployed)
                    _this._addAlertAfterDeployForRegion(evt, region);

                return resolve(evt);
            });
        }

        _addAlertAfterDeployForRegion(evt, region) {
            let _this = this,
            cloudWatch = new AWS.CloudWatch({
                region: region,
                accessKeyId: this.S.config.awsAdminKeyId,
                secretAccessKey: this.S.config.awsAdminSecretKey
            });

            _this.stage = evt.options.stage;

            return new BbPromise(function (resolve, reject) {
                if (_this.S.cli.action != 'deploy' || (_this.S.cli.context != 'function' && _this.S.cli.context != 'dash'))
                    return;

                // candidate for function
                for (var deployedIndex in evt.data.deployed[region]) {
                    let deployed = evt.data.deployed[region][deployedIndex],
                        alertPathFile = _this.S.config.projectPath + '/' + deployed.component + '/' + deployed.module + '/' + deployed.function + '/alerting.json';

                    if (!fs.existsSync(alertPathFile)) {
                        continue;
                    }

                    try {
                        var alertContents = JSON.parse(fs.readFileSync(alertPathFile));

                        if (!alertContents.length > 0) {
                            alertContents = [alertContents];
                        }
                    } catch (e) {
                        console.log('alerting.json not readable');
                        continue;
                    }

                    var functionName = _this._getFunctionNameByArn(deployed.Arn, _this.stage);
                    console.log('SERVERLESS-PLUGIN-ALERTING: adding alerts to ' + functionName + ':' + _this.stage);

                    for (var i in alertContents) {
                        var alertContent = alertContents[i];

                        // only if there is a sns topic
                        if (!alertContent.notificationTopicStageMapping[_this.stage]) {
                            continue;
                        }

                        _this._setNotificationActionByArn(
                            deployed.Arn,
                            alertContent.notificationTopicStageMapping,
                            _this.stage
                        );

                        for (var metricname in alertContent.alerts) {
                            var topicName = alertContent.notificationTopicStageMapping[_this.stage];
                            cloudWatch.putMetricAlarm(
                                _this._getAlarmConfig(functionName, metricname, alertContent.alerts[metricname], _this.stage, topicName), 
                                function(err, data) {
                                    if(err) {
                                        console.log(err);
                                        console.log(err.stack);
                                    }
                                }
                            );
                        }
                        
                    }
                }

                return resolve(evt, region);
            });
        }

        _getFunctionNameByArn(arn, stage) {
            return arn.split(':function:')[1].replace(':' + stage, '');
        }

        _setNotificationActionByArn(arn, map, stage) {
            var name = arn.split(':function:')[0].replace(':lambda:', ':sns:');
            this._notificationAction = name + ':' + map[stage];
        }

        _getAlarmConfig(functionName, metric, alertConfig, stage, topicName) {
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
                InsufficientDataActions: [this._notificationAction],
                OKActions: [this._notificationAction]
            };
        }
    }

    return ServerlessPluginAlerting;
};
