#!/usr/bin/env node
var readline = require('readline');
var spawn = require('child_process').spawnSync;
var fs = require("fs");

function triggerUploads(commitInfo) {
  let syncedFiles = [];
  for(f of commitInfo.files) {
      if(f.mode == "M" || f.mode == "A") {
          if(syncedFiles.indexOf(f.path)>-1) {
              console.log("skipping re-occurrence of " + f.path);
              continue;
          }
          syncedFiles.push(f.path);
          console.log("file " + f.path + " has been added/modified and needs sync to confluence");
          //console.log("cwd= " + process.cwd());
          //console.log("args=" + JSON.stringify(process.argv, null, 2));
          let comment = "" + commitInfo.comment + " (from commit " + commitInfo.sha + ")";
          let uploader = spawn(__dirname + '/index.js', [commitInfo.author, f.path, comment]);
          //uploader.stdout.on('data', (data) => {console.log(`stdout: ${data}`)});
          //uploader.stderr.on('data', (data) => {console.error(`stderr: ${data}`)});
          //uploader.on('close', (code) => {console.log(`child process exited with code ${code}`)});
          //console.log("uploader: " + JSON.stringify(uploader, null, 2));
          console.log(""+uploader.stdout);
          if(uploader.stderr && uploader.stderr.length > 0)console.log("stderr: " + uploader.stderr);
      }
  }
}

var config = require("./config.json");
if(process.argv.length > 2) {
  for(let i = 2; i < process.argv.length; i++) {
    let arg = process.argv[i];
    if(arg.startsWith("-C")){
      let tokens = arg.split(/=/);
      if(tokens.length != 2) {
        console.error("passed cmd line config arg without value: " + arg);
        process.exit(1);
      }
      else {
        let key = tokens[0].substring(2,tokens[0].length);
        config[key]=tokens[1];
      }  
    }
    let data = JSON.stringify(config, null, 2);
    console.error("config: " + data);
    fs.writeFileSync(__dirname + "/config.json", data);
  }
}
//process.exit(0);

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal:false});
    
var result = {commits:[]};
var currentCommit = null;


rl.on('close', function(){
  console.log("results=" + JSON.stringify(result, null, 2));
  let flatResults = {commits:[]};
  for(let c of result.commits) {
      let tc = flatResults.commits.find(sc => {return sc.sha == c.sha});
      if(tc) {
          //console.log("next occurrence of commit " + c.sha + ", appending");
          if(tc.author != c.author) {
              console.error("author mismatch " + tc.author + " vs. " + c.author);
              process.exit(1);
          }
          if(tc.comment != c.comment) {
            console.error("comment mismatch " + tc.comment + " vs. " + c.comment);
            process.exit(1);
          }
          if(tc.isMerge != c.isMerge) {
            console.error("merge status mismatch " + tc.isMerge + " vs. " + c.isMerge);
            process.exit(1);
          }
          if(tc.unixDate != c.unixDate) {
            console.error("date mismatch " + tc.unixDate + " vs. " + c.unixDate);
            process.exit(1);
          }
      }
      else {
          tc = {...c};
          flatResults.commits.push(tc);
          tc.files = [];
          delete tc.currentOrigSha;
          //console.log("first occurrence of commit " + c.sha + ", adding: " + JSON.stringify(tc));
      }
      for(let fd of c.files) {
          tc.files.push({mode:fd.mode, from:c.currentOrigSha, path:fd.path, score:fd.score, sourcePath:fd.sourcePath});
      }
  }
  console.log(JSON.stringify(flatResults, null, 2));
  triggerUploads(flatResults.commits[0]);
});

rl.on('line', function(line) {
    //console.log("processing line: '" + line + "'");
    if(line.length == 0) {
        //console.log("skipping empty line");
        return;
    }
    let matches = line.match(/^commit ([a-f0-9]+)( \(from (.*?)\))?/); // \(from ([a-f0-9]+)\) \(.*?\)/);
    if(matches) {
        //console.log("matched " + JSON.stringify(matches));
        currentCommit = {isMerge: matches[2] != null, sha:matches[1],files:[]};
        if(currentCommit.isMerge) currentCommit.currentOrigSha=matches[3];
        //console.log("matched new commit block start, data: " + JSON.stringify(currentCommit));
        result.commits.push(currentCommit);
    }
    else {
      
      if(Object.keys(currentCommit).indexOf("isMerge") > -1 && currentCommit.isMerge && !currentCommit.mergeToShaShort) {
        //console.log("looking for Merge: line");
        let matches = line.match(/^Merge:\s+([a-f0-9]+)\s+([a-f0-9]+).*?/);
        if(matches) {
            currentCommit.isMerge = true;
            //console.log("matched " + JSON.stringify(matches));
            currentCommit.mergeToShaShort=matches[1];
            currentCommit.mergeFromShaShort=matches[2];
        }   
      }
      else if(!currentCommit.author) {
        //console.log("looking for author: line");
        let matches = line.match(/Author:\s+(.*?)\s+(<.*?>)/);
        if(matches) {
            currentCommit.author = matches[1];
            currentCommit.authorEmail = matches[2];
            //console.log("matched " + JSON.stringify(matches));
        }

      }
      else if(!currentCommit.date) {
        //console.log("looking for Date: line"); // Tue Feb 11 18:12:34 2020 +0100
        let matches = line.match(/Date:\s+(.*?)\s+(.*?)\s+(\d+)\s+(\d+):(\d+):(\d+)\s+(\d+)\s(\S+)/);
        if(matches) {
            //console.log("matched " + JSON.stringify(matches));
            let month = matches[2];
            let day = matches[3];
            let hour = matches[4];
            let minute = matches[5];
            let second = matches[6];
            let year = matches[7];
            let offset = matches[8];
            var date = new Date(""+day+" "+month+" "+year+" "+hour+":"+minute+":"+second+ " "+offset);
            //console.log("Date parsed: " + date);
            currentCommit.date = date;
            currentCommit.unixTime = date.getTime()/1000;
        }
      }
      else if(!currentCommit.comment) {
        //console.log("looking for comment");
        let matches = line.match(/^\s+(.*)/);
        if(matches) {
            //console.log("matched " + JSON.stringify(matches));
            currentCommit.comment = matches[1];
            //console.log("found comment '" + currentCommit.comment + "'");
        }        
      }
      else {
          //console.log('looking for file line');
          let matches = line.match(/^([MAUDRC])(\d+)?\t(.*?)(\t(\.*?))*\s*$/);
          if(matches) {
            //console.log("matched " + JSON.stringify(matches));
            let file = {
                mode: matches[1]
            };
            if(file.mode == "R" || file.mode == "C"){
                file.score = matches[2];
                file.sourcePath = matches[3];
                file.path = matches[5];
            }
            else {
                file.path = matches[3];
            }
            currentCommit.files.push(file);
        }        
      }
    }
});

