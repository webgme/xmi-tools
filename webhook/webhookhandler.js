/*globals*/
/**
 * 
 * @author pmeijer / https://github.com/pmeijer
 */

var Express = require('express'),
    mongodb = require('mongodb'),
    superagent = require('superagent'),
    Q = require('q'),
    bodyParser = require('body-parser'),
    run_plugin = require('webgme/src/bin/run_plugin'),
    CONSTANTS = require('./constants');


function PluginHandler() {
    var app = new Express(),
        server,
        dbConn;

    function runPlugin(payload, callback) {
        var args = ['node', 'run_plugin.js', CONSTANTS.PLUGIN_ID],
            collection;

        args = args.concat([payload.projectName,
            '-o', payload.owner,
            '-u', payload.data.userId,
            '-c', payload.data.commitHash
        ]);

        return run_plugin.main(args)
            .then(function (pluginResult) {
                if (pluginResult.success) {
                    console.log(JSON.stringify(pluginResult, null, 2));
                    console.log('SUCCEEDED!');
                } else {
                    console.error(JSON.stringify(pluginResult, null, 2));
                    console.error('FAILED!');
                }
            })
            .catch(function (err) {
                console.error('Exception:', err);
            });
    }

    this.start = function (callback) {
        // Parse the body.
        app.use(bodyParser.json());

        app.post('/runPlugin', function (req, res) {
            var payload = req.body;
            runPlugin(payload)
                .finally(function () {
                    console.log('done');
                });

            res.sendStatus(200);
        });

        server = app.listen(CONSTANTS.WEB_HOOK_PORT);
        //TODO: Return promise
        callback();
    }

    this.stop = function (callback) {
        //TODO: Stop server with promise.
        callback();
    }
}

if (require.main === module) {
    var handler = new PluginHandler();
    handler.start(function() {
        console.log('listening at port', CONSTANTS.WEB_HOOK_PORT);
    });
}
