/*globals define*/
/*jshint node:true, browser:true*/

/**
 * From a GME project generates an ecore file based on the meta-nodes and an xmi. The meta-nodes themselves are
 * part of the xmi file and can be distinguished by them not having a base reference.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'common/util/xmljsonconverter',
    'common/core/constants',
    'q'
], function (PluginConfig,
             pluginMetadata,
             PluginBase,
             converters,
             CORE_CONSTANTS,
             Q) {
    'use strict';

    var REF_PREFIX = '#//',
        POINTER_SET_DIV = '-',
        ATTR_PREFIX = 'atr-',
        REL_PREFIX = 'rel-',
        INV_REL_PREFIX = 'invrel-',
        SET_REL_PREFIX = 'set-',
        CONTAINMENT_PREFIX = '',
        BASE = 'base',
        RELID = 'relid',
        ID = 'id',
        IS_META = 'isMeta',
        ROOT_NAME = 'ROOT',
        NS_URI = 'www.webgme.org', // FIXME: This is just a dummy..
        DATA_TYPE_MAP = {};

    // jscs:disable maximumLineLength
    DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.STRING] = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString';
    DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.FLOAT] = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EFloat';
    DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.INTEGER] = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt';
    DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.BOOLEAN] = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean';
    // TODO: Currently asset is just treated as string
    DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.ASSET] = 'ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString';
    // jscs:enable maximumLineLength

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of XMIExporter.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin XMIExporter.
     * @constructor
     */
    var XMIExporter = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    };

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    XMIExporter.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    XMIExporter.prototype = Object.create(PluginBase.prototype);
    XMIExporter.prototype.constructor = XMIExporter;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    XMIExporter.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            jsonToXml = new converters.JsonToXml();

        self.getXMIData(self.core, self.rootNode, self.META)
            .then(function (xmiData) {
                var languageName = self.core.getAttribute(self.rootNode, 'name'),
                    ecoreData = self.getEcoreData(self.core, self.rootNode, self.META),
                    eData = {},
                    xData = {};

                eData['ecore:EPackage'] = ecoreData;
                xData[languageName + ':' + ROOT_NAME] = xmiData;

                return Q.all([
                    self.saveFile(languageName + '.ecore', jsonToXml.convertToString(eData)),
                    self.saveFile(languageName + '.xmi', jsonToXml.convertToString(xData))
                ]);
            })
            .then(function () {
                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch(function (err) {
                self.logger.error(err.stack);
                callback(err, self.result);
            });
    };

    XMIExporter.prototype.saveFile = function (fName, content) {
        var self = this,
            fs;

        if (typeof window === 'undefined' && process.env.WRITE_FILES) {
            fs = require('fs');
            return Q.ninvoke(fs, 'writeFile', fName, content);
        } else {
            return self.blobClient.putFile(fName, content)
                .then(function (metaModelHash) {
                    self.result.addArtifact(metaModelHash);
                });
        }
    };

    XMIExporter.prototype.getEcoreData = function (core, rootNode, name2MetaNode) {
        var languageName = core.getAttribute(rootNode, 'name'),
            metaNames = Object.keys(name2MetaNode),
            path2MetaNode = core.getAllMetaNodes(rootNode),
            metaPaths = Object.keys(path2MetaNode),
            metaPathToDerivedMetaPaths = {},
            data = {
                '@xmi:version': '2.0',
                '@xmlns:xmi': 'http://www.omg.org/XMI',
                '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                '@xmlns:ecore': 'http://www.eclipse.org/emf/2002/Ecore',
                '@name': languageName,
                '@nsPrefix': languageName,
                '@nsURI': NS_URI,
                eClassifiers: []
            },
            rootNodeData = {
                '@xsi:type': 'ecore:EClass',
                '@name': 'ROOT',
                eStructuralFeatures: []
            },
            nameToInvrel = {},
            nameToClassifier = {},
            m,
            mm;

        data.eClassifiers.push(rootNodeData);

        function getAttributesData(attrs) {
            var i,
                attrNames = Object.keys(attrs),
                result = [];

            for (i = 0; i < attrNames.length; i += 1) {
                result.push({
                    '@xsi:type': 'ecore:EAttribute',
                    '@name': ATTR_PREFIX + attrNames[i],
                    '@eType': DATA_TYPE_MAP[attrs[attrNames[i]].type]
                    //TODO: Deal with enums, ranges, regexps.
                });
            }

            return result;
        }

        function getChildrenData(children) {
            var result = [],
                addedChildren = {},
                ownChildrenPaths = [],
                derived,
                i,
                j,
                childName;

            children.items = children.items || [];

            // Add the directly defined containment rules.
            for (i = 0; i < children.items.length; i += 1) {
                childName = core.getAttribute(path2MetaNode[children.items[i]], 'name');
                addedChildren[children.items[i]] = true;
                result.push({
                    '@xsi:type': 'ecore:EReference',
                    '@name': CONTAINMENT_PREFIX + childName,
                    '@eType': REF_PREFIX + childName,
                    '@lowerBound': children.minItems[i] === -1 ? 0 : children.minItems[i],
                    '@upperBound': children.maxItems[i],
                    '@containment': 'true',
                });
            }

            ownChildrenPaths = Object.keys(addedChildren);

            for (i = 0; i < ownChildrenPaths.length; i += 1) {
                derived = metaPathToDerivedMetaPaths[ownChildrenPaths[i]];
                for (j = 0; j < derived.length; j += 1) {
                    if (addedChildren[derived[j]] === true) {
                        continue;
                    }

                    childName = core.getAttribute(path2MetaNode[derived[j]], 'name');
                    addedChildren[derived[j]] = true;
                    result.push({
                        '@xsi:type': 'ecore:EReference',
                        '@name': CONTAINMENT_PREFIX + childName,
                        '@eType': REF_PREFIX + childName,
                        '@containment': 'true'
                    });
                }
            }

            return result;
        }

        function getPointersAndSetsData(refs, name, path) {
            var result = [],
                refNames = Object.keys(refs),
                isPointer,
                addedRefs,
                ownRefs,
                derived,
                i,
                j,
                k,
                ref,
                ownerName,
                targetName;

            for (i = 0; i < refNames.length; i += 1) {
                ref = refs[refNames[i]];
                addedRefs = {};
                isPointer = ref.min === 1 && ref.max === 1;

                for (j = 0; j < ref.items.length; j += 1) {
                    targetName = core.getAttribute(path2MetaNode[ref.items[j]], 'name');
                    addedRefs[ref.items[j]] = {
                        minItems: ref.minItems[j],
                        maxItems: ref.maxItems[j]
                    };
                    result.push({
                        '@xsi:type': 'ecore:EReference',
                        '@name': REL_PREFIX + refNames[i] + POINTER_SET_DIV + targetName,
                        '@eType': REF_PREFIX + targetName,
                        '@lowerBound': ref.minItems[j] === -1 ? 0 : ref.minItems[j],
                        '@upperBound': ref.maxItems[j],
                    });

                    if (isPointer) {
                        // Add the inverse relationships for pointers
                        nameToInvrel[targetName] = nameToInvrel[targetName] || {};
                        nameToInvrel[targetName][INV_REL_PREFIX + refNames[i] + POINTER_SET_DIV + name] = {
                            '@xsi:type': 'ecore:EReference',
                            '@name': INV_REL_PREFIX + refNames[i] + POINTER_SET_DIV + name,
                            '@eType': REF_PREFIX + name,
                            '@lowerBound': 0,
                            '@upperBound': -1,
                        };

                        derived = metaPathToDerivedMetaPaths[path];

                        for (k = 0; k < derived.length; k += 1) {
                            ownerName = core.getAttribute(path2MetaNode[derived[k]], 'name');
                            nameToInvrel[targetName][INV_REL_PREFIX + refNames[i] + POINTER_SET_DIV + ownerName] = {
                                '@xsi:type': 'ecore:EReference',
                                '@name': INV_REL_PREFIX + refNames[i] + POINTER_SET_DIV + ownerName,
                                '@eType': REF_PREFIX + ownerName,
                                '@lowerBound': 0,
                                '@upperBound': -1,
                            };
                        }
                    }
                }

                ownRefs = Object.keys(addedRefs);
                for (j = 0; j < ownRefs.length; j += 1) {
                    derived = metaPathToDerivedMetaPaths[ownRefs[j]];
                    for (k = 0; k < derived.length; k += 1) {
                        if (addedRefs.hasOwnProperty(derived[k]) === true) {
                            continue;
                        }

                        targetName = core.getAttribute(path2MetaNode[derived[k]], 'name');
                        addedRefs[derived[k]] = true;
                        result.push({
                            '@xsi:type': 'ecore:EReference',
                            '@name': REL_PREFIX + refNames[i] + POINTER_SET_DIV + targetName,
                            '@eType': REF_PREFIX + targetName,
                            '@lowerBound': addedRefs[ownRefs[j]].minItems === -1 ? 0 : addedRefs[ownRefs[j]].minItems,
                            '@upperBound': addedRefs[ownRefs[j]].maxItems,
                        });
                    }
                }
            }

            return result;
        }

        function getMetaNodeData(name, node) {
            var metaData = {
                    '@xsi:type': 'ecore:EClass',
                    '@name': name,
                    eStructuralFeatures: []
                },
                baseNode = core.getBase(node),
                ownMetaJson;

            ownMetaJson = core.getOwnJsonMeta(node);

            nameToClassifier[name] = metaData;

            if (baseNode) {
                // TODO: check if base is meta-node
                // TODO: For libraries can we use another identifier?
                metaData['@eSuperTypes'] = REF_PREFIX + core.getAttribute(baseNode, 'name');
            } else {
                // This is the FCO -> define _id attr and base pointer
                metaData.eStructuralFeatures.push({
                    '@xsi:type': 'ecore:EAttribute',
                    '@name': ID,
                    '@eType': DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.STRING],
                    '@iD': 'true'
                });

                metaData.eStructuralFeatures.push({
                    '@xsi:type': 'ecore:EAttribute',
                    '@name': RELID,
                    '@eType': DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.STRING]
                });

                metaData.eStructuralFeatures.push({
                    '@xsi:type': 'ecore:EAttribute',
                    '@name': IS_META,
                    '@eType': DATA_TYPE_MAP[CORE_CONSTANTS.ATTRIBUTE_TYPES.BOOLEAN]
                });

                metaData.eStructuralFeatures.push({
                    '@xsi:type': 'ecore:EReference',
                    '@name': BASE,
                    '@eType': REF_PREFIX + name,
                    '@lowerBound': 0,
                    '@upperBound': 1,
                });
            }

            if (core.isAbstract(node)) {
                // This is a visual feature really.
                //metaData['@abstract'] = 'true';
            }

            if (ownMetaJson.attributes) {
                metaData.eStructuralFeatures.push(getAttributesData(ownMetaJson.attributes));
            }

            metaData.eStructuralFeatures.push(
                getChildrenData(ownMetaJson.children || {})
            );

            metaData.eStructuralFeatures.push(
                getPointersAndSetsData(ownMetaJson.pointers || {}, name, core.getPath(node))
            );

            return metaData;
        }

        // Build up mapping from meta-node path to all derived meta-nodes' paths.
        for (m = 0; m < metaPaths.length; m += 1) {
            metaPathToDerivedMetaPaths[metaPaths[m]] = [];
            for (mm = 0; mm < metaPaths.length; mm += 1) {
                if (core.isTypeOf(path2MetaNode[metaPaths[mm]], path2MetaNode[metaPaths[m]]) === true &&
                    metaPaths[mm] !== metaPaths[m]) {
                    metaPathToDerivedMetaPaths[metaPaths[m]].push(metaPaths[mm]);
                }
            }
        }

        for (m = 0; m < metaNames.length; m += 1) {
            // Gather the meta-data for each node.
            data.eClassifiers.push(getMetaNodeData(metaNames[m], name2MetaNode[metaNames[m]]));
            // Add meta-node to root-node children.
            rootNodeData.eStructuralFeatures.push({
                '@xsi:type': 'ecore:EReference',
                '@name': CONTAINMENT_PREFIX + metaNames[m],
                '@eType': REF_PREFIX + metaNames[m],
                '@lowerBound': 0,
                '@upperBound': -1,
                '@containment': 'true',
            });
        }

        for (m in nameToInvrel) {
            for (mm in nameToInvrel[m]) {
                nameToClassifier[m].eStructuralFeatures.push(nameToInvrel[m][mm]);
            }
        }

        return data;
    };

    XMIExporter.prototype.getXMIData = function (core, rootNode, name2MetaNode, callback) {
        var languageName = core.getAttribute(rootNode, 'name'),
            data = {
                '@xmi:version': '2.0',
                '@xmlns:xmi': 'http://www.omg.org/XMI',
                '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
            },
            fcoName = core.getAttribute(core.getFCO(rootNode), 'name'),
            path2Data = {};

        data['@xmlns:' + languageName] = NS_URI;
        data['@xsi:schemaLocation'] = NS_URI + ' ' + languageName + '.ecore';
        path2Data[''] = data;

        function atNode(node, next) {
            var deferred = Q.defer(),
                parent = core.getParent(node),
                parentData = path2Data[core.getPath(parent)],
                metaNode = core.getBaseType(node),
                baseNode = core.getBase(node),
                metaName = core.getAttribute(metaNode, 'name'),
                containmentRel = CONTAINMENT_PREFIX + core.getAttribute(metaNode, 'name'),
                nodeData = {
                    '@xsi:type': languageName + ':' + core.getAttribute(metaNode, 'name')
                },
                promises = [];

            path2Data[core.getPath(node)] = nodeData;

            parentData[containmentRel] = parentData[containmentRel] || [];
            parentData[containmentRel].push(nodeData);

            nodeData['@' + ID] = core.getGuid(node);
            nodeData['@' + RELID] = core.getRelid(node);
            nodeData['@' + IS_META] = node === metaNode;

            core.getAttributeNames(node).forEach(function (attrName) {
                nodeData['@' + ATTR_PREFIX + attrName] = core.getAttribute(node, attrName);
            });

            core.getPointerNames(node).forEach(function (ptrName) {
                var targetPath = core.getPointerPath(node, ptrName);

                if (targetPath) {
                    promises.push(
                        core.loadByPath(rootNode, targetPath)
                            .then(function (targetNode) {
                                if (ptrName === 'base') {
                                    nodeData['@' + BASE] = core.getGuid(targetNode);
                                } else {
                                    var targetMetaNode = core.getBaseType(targetNode),
                                        targetMetaName = core.getAttribute(targetMetaNode, 'name');

                                    nodeData['@' + REL_PREFIX + ptrName + POINTER_SET_DIV + targetMetaName] =
                                        core.getGuid(targetNode);
                                }
                            })
                    );
                }
            });

            core.getSetNames(node).forEach(function (setName) {
                var memberPaths = core.getMemberPaths(node, setName);
                memberPaths.forEach(function (memberPath) {
                    promises.push(
                        core.loadByPath(rootNode, memberPath)
                            .then(function (memberNode) {
                                var memberMetaNode = core.getBaseType(memberNode),
                                    memberMetaName = core.getAttribute(memberMetaNode, 'name'),
                                    setAttr = '@' + SET_REL_PREFIX + setName + POINTER_SET_DIV + memberMetaName;

                                nodeData[setAttr] = typeof nodeData[setAttr] === 'string' ?
                                    nodeData[setAttr] + ' ' + core.getGuid(memberNode) : core.getGuid(memberNode);
                            })
                    );
                });

            });

            core.getCollectionNames(node).forEach(function (collectionName) {
                var collectionPaths = core.getCollectionPaths(node, collectionName);
                if (collectionName === 'base') {
                    return;
                }
                collectionPaths.forEach(function (collectionPath) {
                    promises.push(
                        core.loadByPath(rootNode, collectionPath)
                            .then(function (collectionNode) {
                                var collectionMetaNode = core.getBaseType(collectionNode),
                                    collectionMetaName = core.getAttribute(collectionMetaNode, 'name'),
                                    collectionAttr =
                                        '@' + INV_REL_PREFIX + collectionName + POINTER_SET_DIV + collectionMetaName;

                                nodeData[collectionAttr] = typeof nodeData[collectionAttr] === 'string' ?
                                nodeData[collectionAttr] + ' ' + core.getGuid(collectionNode) :
                                    core.getGuid(collectionNode);
                            })
                    );
                });

            });

            Q.all(promises)
                .then(deferred.resolve)
                .catch(deferred.reject);

            return deferred.promise.nodeify(next);
        }

        return core.traverse(rootNode, {excludeRoot: true, stopOnError: true}, atNode)
            .then(function () {
                return data;
            })
            .nodeify(callback);
    };

    return XMIExporter;
});