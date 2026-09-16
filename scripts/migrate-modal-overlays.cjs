// Mechanical JSX tag migration; retains each existing dialog's content and handlers.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../web/node_modules/typescript');
const root = path.resolve(__dirname, '../web/src');
const target = path.join(root, 'components/common/ModalOverlay');
function visitFiles(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir,item.name);
    if (item.isDirectory()) { visitFiles(file); continue; }
    if (!file.endsWith('.tsx') || file === target + '.tsx') continue;
    let text = fs.readFileSync(file,'utf8');
    const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const changes = [];
    function walk(node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source)==='div') {
        const classAttribute = node.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='className');
        if (classAttribute?.initializer && /\bmodal-overlay\b/.test(classAttribute.initializer.getText(source))) {
          for (const tag of [node.openingElement.tagName,node.closingElement.tagName]) changes.push({start:tag.getStart(source),end:tag.end});
        }
      }
      ts.forEachChild(node,walk);
    }
    walk(source);
    if (!changes.length) continue;
    for (const change of changes.sort((a,b)=>b.start-a.start)) text=text.slice(0,change.start)+'ModalOverlay'+text.slice(change.end);
    let relative=path.relative(path.dirname(file),target).replaceAll('\\','/');
    if (!relative.startsWith('.')) relative='./'+relative;
    text=`import { ModalOverlay } from '${relative}';\n`+text;
    fs.writeFileSync(file,text);
    console.log(path.relative(root,file)+': '+changes.length/2+' dialogs');
  }
}
visitFiles(root);
