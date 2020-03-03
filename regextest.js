let text = "[gitlab_cicd]: ./README/gitlab-cicd.png\n[confluence]: ./README/confluence.png"
let pageId = "README";
let pattern = "\\s*\\[(.*?)\\]:\\s*(\\./)?"+pageId+"/(.*)";
let re1 = new RegExp(pattern, "g");
console.log("regex=" + re1);
let matches = text.match(re1);
console.log("matches=" + JSON.stringify(matches));