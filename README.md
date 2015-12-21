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
 - it searches in the functions folder for the alerting.json file and adds the configured alerts


### alerting.json

#### Notification-Topics

 - Here you can set a SNS Topic that receives Messages, if a metric triggers an alarm.
 - you can attach manually another lambda function to the SNS-Topic to do anything on these alarms.
 (For example Push a notification to a messaging system like slack, send a email or push data to any Rest-Api.)

#### Alerts

 - each alert has its used metric as key
 - the values were used to fill up a aws-cli command
 - http://docs.aws.amazon.com/cli/latest/reference/cloudwatch/put-metric-alarm.html