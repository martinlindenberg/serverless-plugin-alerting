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
 - *AND/OR* place a global-alerting.json file next to your s-project.json file in the projects root folder
 - feel free to modify it as required

### Run the Plugin

 - the plugin uses a hook that is called after each deployment of a function
 - you only have to deploy your function as usual `sls function deploy`

#### Singe configuration for all functions (global-alerting.json)

 - copy the file global-alerting.json into your projects root folder
 - the provided alerts will be created for every deployed function automatically
 - same structure as alerting.json
 - these alerts were appended to the alerts defined in alerting.json

#### Special configuration for every function (alerting.json)

 - copy the file alerting.json into your functions folder
 - these alerts were appended to the alerts defined in global-alerting.json

### Structure

 - array of alerting definition objects
 - you can add multiple alerts as an array of alerting-objects
 - you can add multiple mertic filters as in array of metricfilter-objects
 - you can add multiple subscription filters as in array of subscritionfilter-objects
 - use-case:
    - alert1: submit normal notifications immediately to instant messenger (Example: Threshold: Errors >= 1 for 1 minute)
    - alert2: submit notification to statuspage of your service to notify the customers about a problem (Example: Threshold: Duration >= 500 for 5 minutes)

- required changes for multiple alerts

```
[
    {
        "notificationTopicStageMapping": { ... },
        "metricFilters":  { ... },
        "subscriptionFilters": { ... },
        "alerts": { ... }
    },
    {
        "notificationTopicStageMapping": { ... },
        "metricFilters":  { ... },
        "subscriptionFilters": { ... },
        "alerts": { ... }
    }
]
```

#### Notification-Topics

 - Here you have to define a mapping between a staging environment name and a SNS Topic that receives Messages
 - make sure that the staging environment exists: `sls variables list`
    - Serverless shows you all stages to show the variables from
    - select one stage and press enter or press ctrl + c (the output of this function is not important now)
    
```
Serverless: Select a stage: 
  1) dev
  2) live
> 3) staging
  4) testing
```
    
 - create the stages, if required: `sls stage create`
 - The mapped SNS Topics will be created automatically if they don't exist
 - What to do next:
    - As soon as these alerts have been created, they automatically submit notifications to these SNS-Topics
    - If you want to react on these alarms you can subscribe Lambda-Functions to these Topics
    (For example Push a notification to a messaging system like slack, send a email or push data to any Rest-Api.)
    - @see https://github.com/martinlindenberg/serverless-plugin-sns :)

#### Metric Filters

 - key: name of the metric filter that needs to be created
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/logs/put-metric-filter.html

#### Subscription Filters

 - key: name of the subscription filter that needs to be created
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/logs/put-subscription-filter.html

#### Alerts

 - key: name of the metric that needs to be checked
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/cloudwatch/put-metric-alarm.html
 - 0.5.8: you can define your own MetricName and Dimensions

```
[
    {
        ...
        "alerts": {
            "Duration": {
                ...
                "metricName": "myOwnMetricName",
                "dimensions": [
                    {
                        Name: "Resource", Value: "myResourceName"
                    },
                    {
                        Name: "FunctionName", Value: "myFunctionName"
                    }
                ]
            }
        }
        ...
    }
]
```
