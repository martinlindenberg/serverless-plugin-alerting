'use strict';

module.exports = function(SPlugin) {

    const AWS      = require('aws-sdk'),
        path       = require('path'),
        fs         = require('fs'),
        BbPromise  = require('bluebird'); // Serverless uses Bluebird Promises and we recommend you do to because they are super helpful :)

    class ServerlessPluginAlerting extends SPlugin {
        constructor(S, config) {
            super(S, config);
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

            return Promise.resolve();
        }

        _addAlertsAfterDeploy(evt) {
            var regionIndex;
            for(regionIndex in evt.regions)
                this._addAlertAfterDeployForRegion(evt, evt.regions[regionIndex]);
        }

        _addAlertAfterDeployForRegion(evt, region) {
            let _this = this,
                cloudWatch = new AWS.CloudWatch({
                    region: region,
                    accessKeyId: this.S._awsAdminKeyId,
                    secretAccessKey: this.S._awsAdminSecretKey
                });

            return new BbPromise(function (resolve, reject) {
                if (_this.S.cli.contextAction != 'deploy') {
                    return;
                }

                if (_this.S.cli.context != 'function' && _this.S.cli.context != 'dash') {
                    return;
                }

                // candidate for function
                for (var i in evt.functions) {
                    var fn = evt.functions[i];
                    var alertPathFile = _this.S._projectRootPath + '/' + fn.pathFunction +  '/alerting.json';

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

                    var functionName = _this._getFunctionNameByArn(fn.deployedAliasArn, fn.deployedAlias);
                    console.log('SERVERLESS-PLUGIN-ALERTING: adding alerts to ' + functionName + ':' + fn.deployedAlias);

                    for (var i in alertContents) {
                        var alertContent = alertContents[i];

                        // only if there is a sns topic
                        if (!alertContent.notificationTopicStageMapping[fn.deployedAlias]) {
                            continue;
                        }

                        _this._setNotificationActionByArn(
                            fn.deployedAliasArn,
                            alertContent.notificationTopicStageMapping,
                            fn.deployedAlias
                        );

                        for (var metricname in alertContent.alerts) {
                            var topicName = alertContent.notificationTopicStageMapping[fn.deployedAlias];
                            cloudWatch.putMetricAlarm(_this._getAlarmConfig(functionName, metricname, alertContent.alerts[metricname], fn.deployedAlias, topicName), function(err, data) {
                                if(err) {
                                    console.log(err);
                                    console.log(err.stack);
                                }
                            });
                        }
                    }
                }

                return resolve(evt);
            });
        }

        _getFunctionNameByArn(arn, stage) {
            var name = arn.split(':function:');
            return name[1].replace(':' + stage, '');
        }

        _setNotificationActionByArn(arn, map, stage) {
            let _this = this;

            var name = arn.split(':function:');
            name = name[0].replace(':lambda:', ':sns:');
            _this._notificationAction = name + ':' + map[stage];
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
