#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var md2conflu = require('./markdown2confluence');
var sfp = "/dev/stdin";
var pagePath = null;
var md = null;
var debugMode = false;

function printUsage(s) {
  console.log(s);
  console.log("\nUsage ./md2cwm.js [-debug] [-pagePath=path/to/page] [markdownFile] \nif no file is provided, will use stdin. Must be executed from space root dir to get correct relative path to pageId resolution. If using stdin, set path to parent dir of markdown from space root as relative path.");
  process.exit(1);
} 
function debug() {
  if(debugMode) {
    console.log(...arguments);
  }
}
var isCLI = !module.parent;
if(isCLI) initFromCmdLine();

function initFromCmdLine() {
  for(let i = 2; i < process.argv.length; i++) {
    debug("argv=" + JSON.stringify(process.argv));
    let arg = process.argv[i];
    if(arg == "-debug") {
      debugMode = true;
      debug("entering debug mode");
    }
    else if(arg.startsWith("-pagePath=")) {
      pagePath = arg.substring(10,arg.length);
      if(path.isAbsolute(pagePath)){
        // resolve relative path
        printUsage("pagePath must be relative");
      }
      debug("normalizing page path from command line '" + pagePath + "'");
      pagePath = path.normalize(pagePath);
      while(pagePath[0] == '.' || pagePath[0] == '/' || pagePath[0] == '\\') {
        pagePath=pagePath.substring(1,pagePath.length);
      }
      while(pagePath[pagePath.length-1] == '/' || pagePath[pagePath.length-1] == '\\') {
        pagePath=pagePath.substring(0,pagePath.length-1);
      }
      debug("setting pagePath=" + pagePath);
    }
    else if(i == process.argv.length-1) {
      sfp = arg;
      debug("sourceFilePath from command line=" + sfp);
      if(path.isAbsolute(sfp)) {
        printUsage("markdown file must be a relative path");
      }
      if(!sfp.toLowerCase().endsWith(".md")) {
        printUsage("source markdown file must have .md extension");
      }
      debug("normalizing '" + sfp + "'");
      let fqMd = path.resolve(sfp);
      let fqSpaceRoot = path.resolve(process.cwd());
      sfp = fqMd.substring(fqSpaceRoot.length+1,fqMd.length);
      debug("normalized sourceFilePath = '" + sfp + "'");
      if(!pagePath) {
        debug("deriving pagePath from sourceFilePath");
        pagePath = sfp.substring(0, sfp.length-3);
        debug("derived page path = " + pagePath);
      }
    }
  }
  // now make sure we get pagePath normalized
  console.log("pagePath = " + pagePath);

  if(sfp != "/dev/stdin") {
    console.error("using source file " + sfp);
    md = fs.readFileSync(process.cwd() + path.sep + sfp, "utf-8");
    console.log(convertMarkdown(md, pagePath));
  }
  else {
    console.error("reading from stdin, pagePath =" + pagePath);
    md = "";
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal:false});
    rl.on('line', function(line) {
      md += line;
    });
    rl.on('close', function(){
      console.log(convertMarkdown(md, pagePath));
    });
  }
}


//var pageIdSeparator = '_';
function pagePath2pageId(pagePath) {
  console.log("pp2pid: got '" + pagePath+ "'");
  let res = pagePath.split(/[\\\/]/g);
  console.log("split=" + JSON.stringify(res));
  res = res.join('_');
  res = res.replace(/\+/g,' ');
  res = res.replace(/%20/g,' ');
  return res;
}

function convertMarkdown(md, pagePath) {
  if(!pagePath)pagePath = "";
  let pageId = pagePath2pageId(pagePath);
  debug("pagePath " + pagePath + " transforms to pageId " + pageId);
  // convert to confluence format
  debug("converting content to markdown...");
  
  debug("preprocessed data:\n" + md);
  md = md2conflu(md);
  
  // fix relative path in attachments
  md = md.replace(/!(.*)!/g,(match, p1, p2) => {
    let i = p1.lastIndexOf('/');
    if(i==-1)return match;
    if(p1.indexOf("://") > -1 || p1.startsWith("/"))return match;
    let img = p1.substring(i+1,p1.length);
    let p = p1.substring(0,i); // only the path before the file
    let pp = pagePath;
    while(p.startsWith("../")) {
      if(pp.length>0 && pp.indexOf("/") > -1) {
        pp = pp.substring(0,pp.lastIndexOf("/"));
        p=p.substring(3,p.length);
      }
      else {
        console.log("relative path " + p1 + " in image ref goes up beyond space root and can't be resolved to pageId");
        return match;
      }
    }
    while(p.startsWith(".")){p=p.substring(1,p.length);}
    while(p.startsWith("/")){p=p.substring(1,p.length);}
    if(p == pagePath) {
      return "!"+img+"!";
    }
    else return "!"+pagePath2pageId(p)+"^"+img+"!";
  });
  
  // fix relative path in link
  md = md.replace(/\[(.*?\|)?(.*?:)?(.*?)(#.*)?(\^.*)?\]/g,(match, p1, p2, p3, p4, p5) => {
    if(p3 != null && (p3.indexOf("://") > -1 || p3.startsWith("/")))return match;
    let p = p3;
    let img = null; // attachment file
    if(!p.toLowerCase().endsWith(".md")) {
      // link to attachment of a page
      let i = p.lastIndexOf('/');
      img = p.substring(i+1,p.length);
      p = p.substring(0,i); // only the path before the file
    }
    else {
      p = p.substring(0,p.length-3); // cut .md ending
    }
    //console.log("img=" + img);
    //console.log("p=" + p);
    let pp = pagePath;
    while(p.startsWith("../")) {
      if(pp.length>0 && pp.indexOf("/") > -1) {
        pp = pp.substring(0,pp.lastIndexOf("/"));
        p=p.substring(3,p.length);
      }
      else {
        console.log("relative path " + p3 + " in link goes up beyond space root and can't be resolved to pageId");
        return match;
      }
    }
    while(p.startsWith(".")){p=p.substring(1,p.length);}
    while(p.startsWith("/")){p=p.substring(1,p.length);}
    //console.log("p=" + p);
    if(p == pagePath) {
      if(img) return "["+(p1?p1:"")+(p2?p2:"")+"^" + img + "]";
      else return "["+(p1?p1:"")+(p2?p2:"")+pagePath2pageId(p)+(p4?p4:"")+(p5?p5:"")+ "]";
    }
    else {
      if(img) return "["+(p1?p1:"")+(p2?p2:"")+pagePath2pageId(p)+"^" + img + "]";
      else return "["+(p1?p1:"")+(p2?p2:"")+pagePath2pageId(p)+(p4?p4:"")+(p5?p5:"")+ "]";
    }
  });
  
  // fix line breaks in tables
  md = md.replace(/<br\/>/g, "\n"); 
  
  // fix trailing new lines
  while(md.endsWith("\n")) {
    md = md.substring(0, md.length-1);
  }
  
  debug("\nconfluence markup=");
  return md;
}

module.exports.convert = convertMarkdown;