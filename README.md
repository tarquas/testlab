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
        
            browser.pageOpenSuccessAll( 'http://google.com/', function( page ) {

                expectPage();

                function expectPage() {
                    console.log( '* expecting search textbox to appear' );
                    page.expectClientSelector( 'form[action="/search"] input[name="q"]', fillForm );
                }

                function fillForm() {
                    console.log( '* filling form' );
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
                    console.log( '* submitting form' );
                    page.clientTest(
                        function() {
                        
                            document.querySelector( 'form[action="/search"]' ).submit();
                        },
                        
                        { },
                        expectSearchResults
                    );
                }

                function expectSearchResults() {
                    console.log( '* expecting search results to appear' );
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
