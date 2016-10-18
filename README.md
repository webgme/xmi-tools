# xmi-tools

This repository provides an exporter of a snap-shot of a webgme project-tree into a serialized xml format somewhat based on xmi and emf's meta-model format ecore. The xmi can be used without regard to the ecore.

To use the plugin from this repository simply register the `XMIExporter` plugin on the root-node. To import the plugin into your own domain-repo invoke the following command (using [webgme-cli](https://github.com/webgme/webgme-cli)):

```
webgme import plugin XMIExport webgme/xmi-tools
```

which will install the head of the master.

### Helpful commands when developing XMIExporter

#### Invoke plugin on code changes
```
set WRITE_FILES=something
nodemon ./node_modules/webgme/src/bin/run_plugin.js XMIExporter XMI
```
