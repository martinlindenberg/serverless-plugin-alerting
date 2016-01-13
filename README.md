Serverless Plugin ALERTING
==========================

This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.

### Installation

 - make sure that aws and serverless are installed
 - @see http://docs.aws.amazon.com/cli/latest/userguide/installing.html
 - @see http://www.serverless.com/

 - install this plugin to your projects plugins folder
 ```
cd projectfolder/plugins/
git clone https://github.com/martinlindenberg/serverless-plugin-alerting.git
 ```

 - install projects dependencies
 ```
 cd projectfolder/plugins/serverless-plugin-alerting
 npm update
 ```

 - add the plugin to your s-project.json file

```
"plugins": [
    {
      "path": "serverless-plugin-alerting"
    }
]
```

 - place the alerting.json file next to your s-function.json file right in the functions folder
 - feel free to modify it as required

### Run the Plugin

 - the plugin uses a hook that is called after each deployment of a function
 - you only have to deploy your function as usual
 - it searches in the functions folder for the alerting.json file and adds the configured alerts


### alerting.json

#### Structure
 - array of alerting definition objects (previous version: single alerting definition object still works)
 - you can add multiple alerts as an array of alerting-objects
 - the second alerting object can be removed, if not required
 - use-case:
    - alert1: submit normal notifications immediately to instant messenger (Example: Threshold: Errors >= 1 for 1 minute)
    - alert2: submit notification to statuspage of your service to notify the customers about a problem (Example: Threshold: Duration >= 500 for 5 minutes)

#### Notification-Topics

 - Here you have to define a mapping between a staging environment name and a SNS Topic that receives Messages
 - *this plugin only adds alerts if there is a stage to SNS-Topic mapping*
 - What to do next:
    - As soon as these alerts have been created, they automatically submit notifications to these SNS-Topics
    - If you want to react on these alarms you can subscribe Lambda-Functions to these Topics
    (For example Push a notification to a messaging system like slack, send a email or push data to any Rest-Api.)

#### Alerts

 - key: name of the metric that needs to be checked
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/cloudwatch/put-metric-alarm.html
