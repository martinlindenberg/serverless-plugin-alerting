Serverless Plugin ALERTING
==========================

[![NPM](https://nodei.co/npm/serverless-plugin-alerting.png?downloads=true)](https://nodei.co/npm/serverless-plugin-alerting/)

This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.

*Note*: This plugin supports Serverless 0.5.* 
(Please use previous releases for other sls-versions)


### Installation

 - make sure that aws and serverless are installed
 - @see http://docs.aws.amazon.com/cli/latest/userguide/installing.html
 - @see http://www.serverless.com/

 - install this plugin to your project
 - (adds the plugin to your node_modules folder)

```
cd projectfolder
npm install serverless-plugin-alerting
```

 - add the plugin to your s-project.json file

```
"plugins": [
    "serverless-plugin-alerting"
]
```

 - place the alerting.json file next to your s-function.json in the directory of the function for which you want to configure alerting
 - feel free to modify it as required

### Run the Plugin

 - the plugin uses a hook that is called after each deployment of a function 
 - you only have to deploy your function as usual `sls function deploy`
 - it searches in the function folder for the alerting.json file and adds the configured alerts

### alerting.json

#### Structure
 - array of alerting definition objects (previous version: single alerting definition object still works)
 - you can add multiple alerts as an array of alerting-objects
 - use-case:
    - alert1: submit normal notifications immediately to instant messenger (Example: Threshold: Errors >= 1 for 1 minute)
    - alert2: submit notification to statuspage of your service to notify the customers about a problem (Example: Threshold: Duration >= 500 for 5 minutes)

- required changes for multiple alerts

```
[
    {
        "notificationTopicStageMapping": { ... },
        "alerts": { ... }
    },
    {
        "notificationTopicStageMapping": { ... },
        "alerts": { ... }
    }
]
```

#### Notification-Topics

 - Here you have to define a mapping between a staging environment name and a SNS Topic that receives Messages
 - make sure that the staging environment exists: `sls env list`
 - create the stages, if required: `sls stage create`
 - The mapped SNS Topics will be created automatically if they don't exist
 - What to do next:
    - As soon as these alerts have been created, they automatically submit notifications to these SNS-Topics
    - If you want to react on these alarms you can subscribe Lambda-Functions to these Topics
    (For example Push a notification to a messaging system like slack, send a email or push data to any Rest-Api.)
    - @see https://github.com/martinlindenberg/serverless-plugin-sns :)

#### Alerts

 - key: name of the metric that needs to be checked
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/cloudwatch/put-metric-alarm.html
