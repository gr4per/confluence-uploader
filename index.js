#!/usr/bin/env node
//const { exec } = require("child_process");
var fs = require('fs')
var path = require('path')
var assert = require('assert')
var OAuth = require('./oauth').OAuth;
var FormData = require('form-data');
var md2cwm = require('./md2cwm');
const debug = false;
var echo = false;

//console.log("called with argv " + JSON.stringify(process.argv));

function printUsage(s) {
  console.log(s);
  console.log("\nUsage ./index.js author markdownfile.md [comment echo]");
  process.exit(1);
} 

if(!process.env.CONSUMER_SECRET || process.env.CONSUMER_SECRET.length == 0) {
  console.error("CONSUMER_SECRET env not set");
  process.exit(1);
}
var author = process.argv[2];
if(!author){ printUsage('should have author');}
author = author.replace(/[^a-zA-Z0-9]/g, '');
//console.log("author: ", author);

var filePath = process.argv[3];
if(!filePath){ printUsage('should have file path'); }
console.log("filePath: ", filePath);
var isMarkdown = true;
if(!filePath.endsWith(".md")) {
  //console.log('filename should end with .md');
  isMarkdown = false;
  //process.exit(0);
}
if(filePath.indexOf('confluence-uploader/') > -1) {
  console.log("files in confluence-uploader are excluded.");
  process.exit(0);
}
let tokens = filePath.split(/[\\\/]/g);
let filename = tokens.pop();
//console.log("filename=" + filename);
console.log("tokens=" + JSON.stringify(tokens));
let pageId = ""+tokens.join('_');

if(filename.endsWith(".md")){
  if(pageId.length>0) pageId+= "_";
  pageId += filename.substring(0, filename.length-3);
}
console.log("pageId=" + pageId);
if(pageId.length == 0) {
  console.log("skipping file " + filename + " because not a page itself and not in a subdirectory belonging to any page.");
  process.exit(0);
}

var fileComment = "updated by CPA Uploader"; 
if(process.argv.length > 4) {
  fileComment = process.argv[4];
}
console.log("Trying update of content matching file " + filePath + ", associated with pageId " + pageId + " using comment " + fileComment + ".");

if(process.argv.length > 5)
  echo = true;

let conflUserEnvName = "CONFL_API_USER_"+author;
let apiUser = process.env[conflUserEnvName];
if(!apiUser){ 
  console.log("Environment variable " + conflUserEnvName + " is not set. Using git user id '" + author + "' as confluence API user.");
  apiUser = author;
}  

let consumerSecretBase64 = process.env['CONSUMER_SECRET'];
if(!consumerSecretBase64) {
  printUsage("Environment variable CONSUMER_SECRET is not set. Aborting.");
}
  
let buff = Buffer.from(consumerSecretBase64, 'base64');
let consumerSecret = buff.toString('ascii');
if(consumerSecret.indexOf("-BEGIN ") > -1){ 
  printUsage("Environment variable CONSUMER_SECRET is in incorrect format. Please make this a one line string, omitting the BEGIN RSA PRIVATE KEY and END RSA PRIVATE KEY lines.");
}
//console.log("decoded cons secret=\n" + consumerSecret + "\n###");


let accessTokenEnvName = "ACCESS_TOKEN_"+author;
let accessToken = process.env[accessTokenEnvName];
if(!accessToken){ printUsage("Environment variable " + accessTokenEnvName + " is not set. Confluence API not accessible.");}

/*
let accessTokenSecretEnvName = "ACCESS_TOKEN_SECRET_"+author;
let accessTokenSecret = process.env[accessTokenSecretEnvName];
if(!accessTokenSecret){ printUsage("Environment variable " + accessTokenSecretEnvName + " is not set. Confluence API not accessible.");}
*/

// setup OAuth client for confluence
var config = require("./config.json");
config.oauth.consumer_secret="-----BEGIN RSA PRIVATE KEY-----\n" + consumerSecret + "\n-----END RSA PRIVATE KEY-----\n";
//console.log("consumer secret=\n" + config.oauth.consumer_secret);
config.oauth.access_token=process.env['ACCESS_TOKEN_'+author];
config.oauth.access_token_secret=process.env['ACCESS_TOKEN_SECRET_'+author];

//console.log("consumer_secret=\n", config.oauth.consumer_secret);

var basePathConfluence = config.protocol + "://" + config.host + ":" + config.port;
function getConsumer(customHeaders){
  let defaultHeaders = {
    "Accept": "*/*",
    "Connection": "close",
    "User-Agent": "Node authentication",
    "X-Atlassian-Token": "nocheck"
  };

  let headers = Object.assign({}, defaultHeaders, customHeaders);
  return new OAuth(
    basePathConfluence + config.paths['request-token'],
    basePathConfluence + config.paths['access-token'],
    config.oauth.consumer_key,
    config.oauth.consumer_secret,
    "1.0",
    null, 
    "RSA-SHA1",
    32,
    headers);
}
var consumerConfluence = getConsumer({});

if(isMarkdown) {
  uploadMarkdown();
} // end is markdown
else {
  uploadAttachment();
  //throw new Error("Attachments not implemented yet.");
}

async function getPageInfo(){
  let getResult = null;
  try{
    getResult = await new Promise((resolve, reject) => {
      consumerConfluence.get(
        basePathConfluence+"/rest/api/content?title="+pageId+"&spaceKey="+config.space+"&expand=version",
        config.oauth.access_token, 
        config.oauth.access_token_secret, 
        function (error, data) {
          //console.log("cb data=\n", data);
          if(error) {
            console.error("get cb error:",error);
            reject(error);
          }
          resolve(JSON.parse(data));
        }
      )
    });
  }
  catch(e) {
    console.error("Not able to retrieve page info.", e);
    process.exit(1);
  }
  console.log("Page info retrieved.");
  if(getResult.results[0]) {
    console.log("content " + pageId + " exists, id = " + getResult.results[0].id);
    if(getResult.results[0].type != "page") {
      throw new Error("Content " + pageId + " exists in space " + config.space +" but type is " + getResult.results[0].type + ", expected was page.");
    }
  }
  else {
    console.log("page doesn't exist.");
    return null;
  }  
  if(debug) {
    console.log("getResult=", JSON.stringify(getResult));
  }
  else console.log("page.id=" +getResult.results[0].id + ", version="+getResult.results[0].version.number);
  return getResult.results[0];  
}

async function getAttachmentInfo(contentId, attachmentFileName){
  let getResult = null;
  try{
    getResult = await new Promise((resolve, reject) => {
      consumerConfluence.get(
        basePathConfluence+"/rest/api/content/"+contentId+"/child/attachment?filename="+attachmentFileName+"&expand=version",
        config.oauth.access_token, 
        config.oauth.access_token_secret, 
        function (error, data) {
          //console.log("cb data=\n", data);
          if(error) {
            console.error("get cb error:",error);
            reject(error);
          }
          resolve(JSON.parse(data));
        }
      )
    });
  }
  catch(e) {
    console.error("Not able to retrieve attachment info.", e);
    process.exit(1);
  }
  console.log("attachment info retrieved.");
  if(getResult.results[0]) {
    console.log("attachment " + attachmentFileName + " exists on page " + pageId + " in space " + config.space + ", id = " + getResult.results[0].id);
    if(getResult.results[0].type != "attachment") {
      throw new Error("Content " + attachmentFileName + " exists on page " + pageId + " in space " + config.space +" but type is " + getResult.results[0].type + ", expected was attachment.");
    }
  }
  else {
    console.log("attachment doesn't exist.");
    return null;
  }  
  if(debug) {
    console.log("getResult=", JSON.stringify(getResult));
  }
  else console.log("attachment.id=" +getResult.results[0].id + ", version="+getResult.results[0].version.number);
  return getResult.results[0];
}

async function uploadAttachment() { 
  let pageInfo = null;
  try {
    pageInfo = await getPageInfo();
  }
  catch(e){
    throw e;
  }
  if(!pageInfo){
    console.log("skipping upload of attachment " + filePath + " because parent page with id " + pageId + " doesn't exist in space " + config.space);
    return null;
  }

  let attachmentInfo = null;
  try {
    attachmentInfo = await getAttachmentInfo(pageInfo.id, filename);
  }
  catch(e){
    throw e;
  }
  let method = "POST";
  let updateUrl = "/rest/api/content/"+pageInfo.id+"/child/attachment";
  let comment = "Added by CPA Uploader";
  if(attachmentInfo){
    console.log("attachment " + filename + " exists on page " + pageId + " in space " + config.space + ".");
    updateUrl += "/" + attachmentInfo.id + "/data";
    comment = "Updated by CPA Uploader";
  }
  else {
    console.log("attachment " + filename + " doesn't exist yet on page " + pageId + " in space " + config.space + ".");
  }
  let updateResult = null;
  let form = new FormData();
  
  form.append("comment", fileComment + " " + comment);
  form.append("minorEdit", "true");
  let origPath = process.cwd() + path.sep + config.filesRoot + path.sep + filePath;
  console.log("reading file from '" + origPath + "', name=" + filename);
  let dataBuffer = fs.readFileSync(origPath);
  form.append("file", dataBuffer, {filename: filename
  //  , contentType:"image/png"
  });
  //form.append("file", fs.createReadStream(origPath), filename );
  let headers = form.getHeaders();
  //console.log("buffer=\n" + form.getBuffer());
  //console.log("headers: " + JSON.stringify(headers));
  try {
    updateResult = await new Promise((resolve, reject) => {
      //method, url, oauth_token, oauth_token_secret, post_body, post_content_type, callback) {
      getConsumer(headers)._putOrPost(
        method, 
        basePathConfluence+updateUrl,
        config.oauth.access_token, 
        config.oauth.access_token_secret,
        form.getBuffer(),
        headers['content-type'],
        function (error, data) {
          //console.log("update cb data=\n", data);
          if(error) {
            //console.error("update cb error:",error);
            reject(error);
          }
          resolve(data);
        }
      )
    });
  }
  catch(e) {
    console.error("attachment update failed", e);
    process.exit(1);
  }
  console.log("Update successful.");
  if(debug) {
    console.log("updateResult=", JSON.stringify(updateResult));
  }    
}

async function uploadMarkdown() {
  let pageInfo = null;
  try {
    pageInfo = await getPageInfo();
  }
  catch(e){
    throw e;
  }
  let method = "POST";
  let updateUrl = "/rest/api/content?title="+pageId+"&spaceKey="+config.space;
  let id = null;
  let versionNo = 1;
  if(pageInfo) {
    console.log("content exists");
    method = "PUT";
    id = pageInfo.id;
    updateUrl = "/rest/api/content/"+id;
    versionNo = pageInfo.version.number+1;
  }
  
  // read file 
  let origFilePath = process.cwd() + path.sep + config.filesRoot + path.sep + filePath;
  console.log("reading file " + origFilePath);
  let data = fs.readFileSync(origFilePath, 'utf-8');
  //console.log("file data: \n", data);
  
  let md = md2cwm.convert(data);
  
  if(echo) {
    console.log("converted:\n", md);
    process.exit(0);
  }
  let postData = {
    "title": pageId,
    "type": "page",
    "space": {
      "key": config.space
    },
    "body": {
      "wiki": {
        "value": md,
        "representation": "wiki"
      }
    },
    "version": {"message": fileComment, "number":versionNo}
  };
  if(id) {
    postData.id = id;
    //postData.version = {number:pageInfo.version.number+1};
    console.log("setting new version of page " + postData.id + " to " + postData.version);
  }
  let updateResult = null;
  try {
    updateResult = await new Promise((resolve, reject) => {
      //method, url, oauth_token, oauth_token_secret, post_body, post_content_type, callback) {
      consumerConfluence._putOrPost(
        method, 
        basePathConfluence+updateUrl,
        config.oauth.access_token, 
        config.oauth.access_token_secret,
        postData,
        "application/json",        
        function (error, data) {
          //console.log("update cb data=\n", data);
          if(error) {
            //console.error("update cb error:",error);
            reject(error);
          }
          resolve(data);
        }
      )
    });
    }
    catch(e) {
      console.error("page update failed", e);
      process.exit(1);
    }
    console.log("Update successful.");
    if(debug) {
      console.log("updateResult=", JSON.stringify(updateResult));
    }
}