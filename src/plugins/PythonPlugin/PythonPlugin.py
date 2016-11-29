import sys
import pprint
from python_api import Core, Node

def mini_project_2(root_node):
    structure = dict()
    structure['3-isMeta'] = root_node.is_meta_node()
    structure['4-metaType'] = root_node.get_meta_node().get_attribute('name')
    for attr_name in root_node.get_attribute_names():
        structure['1-' + attr_name] = root_node.get_attribute(attr_name)
    for ptr_name in root_node.get_pointer_names():
        structure['2-' + ptr_name] = root_node.get_pointer_node(ptr_name).get_attribute('name')
    children = root_node.get_children()
    if len(children) > 0:
        structure['5-children'] = []
        for child in children:
            structure['5-children'].append(mini_project_2(child))
    return structure

def mini_project_2_meta(meta_nodes):
    res = []
    for meta_node in meta_nodes:
        attr = dict()
        attr['name'] = meta_node.get_attribute('name')
        attr['path'] = meta_node.get_path()
        attr['nbrOfChildren'] = len(meta_node.get_children())
        base = meta_node.get_base()
        attr['base'] = None
        if base is not None:
            attr['base'] = base.get_attribute('name')
        res.append(attr)
    return res

if __name__ == '__main__':
    filename = sys.argv[1]
    pp = pprint.PrettyPrinter(indent=4)

    core = Core(filename)
    root_node = core.get_root_node()

    structure = dict()
    structure['1-name'] = 'ROOT'
    structure['5-children'] = []
    for child in root_node.get_children():
        structure['5-children'].append(mini_project_2(child))
    pp.pprint(structure)
    print
    pp.pprint(mini_project_2_meta(core.get_all_meta_nodes()))
