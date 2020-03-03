var md2cwm = require('../md2cwm');
var assert = require('assert');

var externalImageURL = "https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png"
describe('md2cwm', function() {
  describe('#convert()', function() {
    // table handling
    it('should convert html line breaks (<br/>) to new line', function() {
      let md = "test<br/>test";
      let expectedWm = "test\ntest";
      assert.equal(md2cwm.convert(md), expectedWm);
    });
    
    
    // image handling (reference)
    it('should convert image external references to external image', function() {
      let md = "![alt text][logo]\n\n[logo]: " + externalImageURL + " \"Logo Title Text 2\"";
      let expectedWm = "!"+externalImageURL + "!";
      assert.equal(md2cwm.convert(md), expectedWm);
    });
    
    /*
    it('should convert image external references to external image including alt and title properties', function() {
      let md = "![alt text][logo]\n\n[logo]: " + externalImageURL + " \"Logo Title Text 2\"";
      let expectedWm = "!"+externalImageURL+"|alt=alt text,title=Logo Title Text 2!";
      assert.equal(md2cwm.convert(md), expectedWm);
    });
    */

    /*
    it('should convert image external references to external image', function() {
      let md = "[alt text][logo]\n[logo]: " + externalImageURL;
      let expectedWm = "!"+externalImageURL+"|alt=alt text!";
      assert.equal(md2cwm.convert(md), expectedWm);
    });
    */

    it('should convert relative image file references to attachment image', function() {
      let md = "![GIT][git_logo]\n\n[git_logo]: README/git-logo.png";
      let expectedWm = "!git-logo.png!";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });

    // image handling inline
    it('should convert relative image file inline to attachment image', function() {
      let md = "![GIT](README/git-logo.png)";
      let expectedWm = "!git-logo.png!";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });

    it('should convert relative image file inline of another page dir to attachment image of other page', function() {
      let md = "![GIT](README/git-logo.png)";
      let expectedWm = "!README^git-logo.png!";
      assert.equal(md2cwm.convert(md, "CONTRIBUTING"), expectedWm);
    });
    
    // link handling reference
    it('should convert absolute link reference', function() {
      let md = "[Link text][link ref]\n\n[link ref]: http://google.com";
      let expectedWm = "[Link text|http://google.com]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    
    it('should convert relative link reference', function() {
      let md = "[Link text][link ref]\n\n[link ref]: CONTRIBUTING.md";
      let expectedWm = "[Link text|CONTRIBUTING]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    
    // link handling inline
    it('should convert absolute link inline', function() {
      let md = "[Link text](http://google.com)";
      let expectedWm = "[Link text|http://google.com]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline', function() {
      let md = "[Link text](./README/Subpage+1.md)";
      let expectedWm = "[Link text|README_Subpage 1]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline independent on space escape char in page title', function() {
      let md = "[Link text](./README/Subpage%201.md)";
      let expectedWm = "[Link text|README_Subpage 1]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline, pointing to parent page', function() {
      let md = "[Link text](../README.md)";
      let expectedWm = "[Link text|README]";
      assert.equal(md2cwm.convert(md, "README/Subpage 1"), expectedWm);
    });
    it('should convert relative link inline, pointing to sibling page asset', function() {
      let md = "[Link text](./CONTRIBUTING/asset.gif)";
      let expectedWm = "[Link text|CONTRIBUTING^asset.gif]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline, pointing to page asset', function() {
      let md = "[Link text](./README/asset.gif)";
      let expectedWm = "[Link text|^asset.gif]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline, pointing to page asset, regardless of leading ./', function() {
      let md = "[Link text](README/asset.gif)";
      let expectedWm = "[Link text|^asset.gif]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline, pointing to page anchor', function() {
      let md = "[Link text](#testme)";
      let expectedWm = "[Link text|#testme]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });
    it('should convert relative link inline, pointing to page anchor of parent sibling page', function() {
      let md = "[Link text](../CONTRIBUTING.md#testme)";
      let expectedWm = "[Link text|CONTRIBUTING#testme]";
      assert.equal(md2cwm.convert(md, "README/Subpage 1"), expectedWm);
    });
    it('should convert relative link inline, including anchor and title', function() {
      let md = "[Link text](Contacts.md#esp \"ESP\")";
      let expectedWm = "[Link text|Contacts#esp]";
      assert.equal(md2cwm.convert(md, "README"), expectedWm);
    });

  });
});