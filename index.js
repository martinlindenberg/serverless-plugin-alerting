'use strict';

module.exports = function(SPlugin) {

    const path     = require('path'),
        fs         = require('fs'),
        BbPromise  = require('bluebird'); // Serverles uses Bluebird Promises and we recommend you do to because they are super helpful :)

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
            let _this = this;

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
                        var alertContent = JSON.parse(fs.readFileSync(alertPathFile));
                    } catch (e) {
                        console.log('alerting.json not readable');
                        continue;
                    }

                    var functionName = _this._getFunctionNameByArn(fn.deployedAliasArn, fn.deployedAlias);
                    console.log('SERVERLESS-PLUGIN-ALERTING: adding alerts to ' + functionName);

                    _this._setNotificationActionByArn(
                        fn.deployedAliasArn,
                        alertContent.notificationTopicStageMapping,
                        fn.deployedAlias
                    );

                    for (var metricname in alertContent.alerts) {
                        exec(_this._getConfigAlarm(functionName, metricname, alertContent.alerts[metricname], fn.deployedAlias), function () {
                            console.log('alarm added');
                        });
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

        _getConfigAlarm(functionName, metric, alertConfig, stage) {
            let _this = this;

            return _this._getPutMetricAlarmCmd({
                'alarmName': functionName + ':' + stage + ' ' + metric,
                'alarmDescription': alertConfig.description,
                'metricName': metric,
                'alarmNamespace': alertConfig.alarmNamespace,
                'alarmStatisticType': alertConfig.alarmStatisticType,
                'alarmPeriod': alertConfig.alarmPeriod,
                'alarmThreshold': alertConfig.alarmThreshold,
                'comparisonOperator': alertConfig.comparisonOperator,
                'functionName': functionName,
                'resource': functionName + ':' + stage,
                'evaluationPeriod': alertConfig.evaluationPeriod,
                'notificationAction': _this._notificationAction
            });
        }

        _getPutMetricAlarmCmd(config) {
            var addCommand = 'aws cloudwatch put-metric-alarm ';
            addCommand += ' --alarm-name "' + config.alarmName + '" ';
            addCommand += ' --alarm-description "' + config.alarmDescription + '" ';
            addCommand += ' --metric-name ' + config.metricName + ' ';
            addCommand += ' --namespace "' + config.alarmNamespace + '" ';
            addCommand += ' --statistic ' + config.alarmStatisticType + ' ';
            addCommand += ' --period ' + config.alarmPeriod + ' ';
            addCommand += ' --threshold ' + config.alarmThreshold + ' ';
            addCommand += ' --comparison-operator ' + config.comparisonOperator + ' ';
            addCommand += ' --dimensions  Name=Resource,Value=' + config.resource + ' ';
            addCommand += ' --dimensions  Name=FunctionName,Value=' + config.functionName + ' ';
            addCommand += ' --evaluation-periods ' + config.evaluationPeriod + ' ';
            addCommand += ' --alarm-actions ' + config.notificationAction + ' ';
            addCommand += ' --ok-actions ' + config.notificationAction + ' ';
            addCommand += ' --insufficient-data-actions ' + config.notificationAction + ' ';

            return addCommand;
        };
    }

    return ServerlessPluginAlerting;

};