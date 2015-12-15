Serverless Plugin ALERTING
==========================

This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.

### Installation

 - make sure that aws and serverless are installed
 - install this plugin to your projects plugins folder (projectfolder/plugins/serverless-plugin-alerting)
 - add the plugin to your s-project.json file

```
"plugins": [
    {
      "path": "serverless-plugin-alerting"
    }
]
```

 - place the alerting.json file next to your s-function.json file right in the functions folder

Example file alerting.json:
```
{
    "notificationTopicStageMapping": {
        "development": "your-dev-sns-topic",
        "testing": "your-testing-sns-topic",
        "staging": "your-staging-sns-topic",
        "live": "your-live-sns-topic"
    },
    "alerts": {
        "Duration": {
            "enabled": true,
            "alarmNamespace": "AWS/Lambda",
            "description": "Alarm if duration of the importer is above 500ms",
            "alarmStatisticType": "Maximum",
            "alarmPeriod": "60",
            "alarmThreshold": "500",
            "comparisonOperator": "GreaterThanOrEqualToThreshold",
            "evaluationPeriod": "1"
        },
        "Errors": {
            "enabled": true,
            "alarmNamespace": "AWS/Lambda",
            "description": "Alarm if function returns an error",
            "alarmStatisticType": "Sum",
            "alarmPeriod": "60",
            "alarmThreshold": "1",
            "comparisonOperator": "GreaterThanOrEqualToThreshold",
            "evaluationPeriod": "1"
        },
        "Throttles": {
            "enabled": true,
            "alarmNamespace": "AWS/Lambda",
            "description": "Alarm if function has more than 5 throttled requests",
            "alarmStatisticType": "Sum",
            "alarmPeriod": "60",
            "alarmThreshold": "5",
            "comparisonOperator": "GreaterThanOrEqualToThreshold",
            "evaluationPeriod": "1"
        }
    }
}

### Run the Plugin

 - the plugin uses a hook that is called after each deployment of a function
 - it searches in the functions folder for the alerting.json file and adds the configured alerts

```
### Notification-Topics:

 - Here you can set a SNS Topic that receives Messages, if a metric triggers an alarm.
 - you can attach another lambda function to the SNS-Topic to do anything on these alarms.
 - For example Push a notification to a messaging system like slack, send a email or push data to any Rest-Api.