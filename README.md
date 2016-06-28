# xmi-tools
# This is still under development...

### Helpful commands

#### Invoke plugin on code changes
```
set WRITE_FILES=something
nodemon ./node_modules/webgme/src/bin/run_plugin.js XMIExporter XMI
```


#### Invoke plugin on model changes

Add the hooks portion to the project in the `_projects`-collection in mongodb (once).

```
{
    "_id" : "guest+XMI",
    ...
    "hooks" : {
        "runPlugin" : {
            "events" : [ 
                "COMMIT"
            ],
            "url" : "http://127.0.0.1:9999/runPlugin"
        }
    }
}
```

Start the webhook-handler

```
set WRITE_FILES=something
node ./webhook/webhookhandler.js
```
