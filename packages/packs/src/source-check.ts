// @ts-nocheck
import ts from 'typescript';
export function inspectFunction(source,file='function.tsx') {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),errors=[];
  const fail=(node,message)=>{const {line}=ast.getLineAndCharacterOfPosition(node.getStart(ast));errors.push(`${file}:${line+1}: ${message}`);};
  function mutableInitializer(node) {
    return !node || ![ts.SyntaxKind.StringLiteral,ts.SyntaxKind.NumericLiteral,ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind);
  }
  function literal(node,depth=0) {
    if(depth>8)return false;
    if(!mutableInitializer(node))return true;
    if(ts.isArrayLiteralExpression(node))return node.elements.every(x=>literal(x,depth+1));
    if(ts.isObjectLiteralExpression(node))return node.properties.every(x=>ts.isPropertyAssignment(x)&&!ts.isComputedPropertyName(x.name)&&literal(x.initializer,depth+1));
    return false;
  }
  for(const statement of ast.statements) {
    if(ts.isVariableStatement(statement)) {
      const declarations=statement.declarationList;
      if(!(declarations.flags&ts.NodeFlags.Const))fail(statement,'Module state must not use let or var');
      for(const d of declarations.declarations) {
        const init=d.initializer;
        const definition=init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&['defineFunction','defineScreen','defineScreens'].includes(init.expression.text);
        const frozen=init&&ts.isCallExpression(init)&&init.expression.getText(ast)==='Object.freeze'&&init.arguments.length===1&&literal(init.arguments[0]);
        if(!definition&&!frozen&&mutableInitializer(init))fail(d,'Keep invocation data inside resolve/View; module constants must be primitives or frozen literal metadata');
      }
    } else if(ts.isExpressionStatement(statement))fail(statement,'Top-level side effects are forbidden in function views');
  }
  function visit(node) {
    if(ts.isIdentifier(node)&&['globalThis','window','document','localStorage','sessionStorage'].includes(node.text))fail(node,'Use component refs and platform clients, not global invocation state');
    ts.forEachChild(node,visit);
  }
  visit(ast);return errors;
}
