TestLab
=======

NodeJS Mocha + PhantomJS e2e Testing Module

This is official code repository of this project.

## Project Official Website

http://prywit.com/projects/testlab/

# Installation

$ `npm i testlab`

# Quick Usage

`test/test-google.js`
```javascript
var  TestLab = require( 'testlab' );


describe( 'slow: phantom: e2e tests', function() {

    this.timeout( 20000 );

    var  browser = new TestLab.WebBrowser( TestLab.WebBrowser.FAST );


    describe( 'google: test google.com search', function() {
    
        this.timeout( 2000 );

        it( 'should show the search prompt as we type the text', function( done ) {
        
            cfg.browser.pageOpenSuccessAll( 'http://google.com/', function( page ) {

                expectPage();

                function expectPage() {
                
                    page.expectClientSelector( 'form[action="/search"] input[role="combobox"]', fillForm );
                }

                function fillForm() {

                    page.clientReadyFormFill(
                        {
                            form   : 'form[action="/search"]',
                            values : {
                                q: 'test',
                            },
                            submit : false,
                        },
                        
                        sendSearchRequest
                    );
                }

                function sendSearchRequest() {

                    page.clientTest(
                        function() {
                        
                            document.querySelector( 'form[action="/search"]' ).submit();
                        },
                        
                        { },
                        expectSearchResults
                    );
                }

                function expectSearchResults() {
                
                    page.expectClientSelector( '#topstuff', page.thenClose( done ) );
                }
            } )            
        } )
    } )
    
} )
```

$ `mocha`

# Developer Guidelines

<b> Javascript Coding Guideline: </b> http://jscode.org/readable
