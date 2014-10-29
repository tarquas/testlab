( function() {  // Safety Padding

var P, S;  // for Prototype and Static class definition objects.


//##### DEPENDENCIES

var    
    phantom    = require('node-phantom-simple'),
    phantomjs  = require('phantomjs'),
    exec       = require('child_process').exec,



//##### GENERIC STATIC

TestLab = {
  
    defaults: {
        waitForRetry: 100,
    },


    //***** Generic Environment Emulator
    
    emulateEnv : function( env, init, callback ) {
      
        if( !env )
            throw new Error(
                'Testlab.emulateEnv: Must pass `env` argument'
            );
        
        if ( env.active ) {
            if ( env.callOnInit )
                return env.callOnInit.push( callback );
                
            return setImmediate( function() {
                callback.apply( this, env.args );
            } );
        }
        
        env.active = true;
        env.callOnInit = [ callback ];
        
        init( emulateDone );

        function emulateDone( _va_args_ ) {
            
            var callOnInit = env.callOnInit;
            
            env.callOnInit = null;
            env.args = arguments;
            
            callOnInit.forEach( function( callback ) {
                setImmediate( function() {
                    callback.apply( this, env.args );
                } );
            } );
        }
    },
    
    
    //***** Tests in a Scope will use specified Child Process

    //Declares that tests in current scope will use the process running.
    //Process will be killed at the end of the scope.
    testExec: function( cmdline, options, callback ) {

        var
            spawned = null,
            onclose = null,
            closed = false;
            
        before( function( done ) {

            spawned = exec(
                cmdline,
                options,
                
                function( err, stdout, stderr ) {

                    if ( err )
                        throw new Error(
                            'TestLab.testExec: failed to start ' +
                            cmdline + ': ' +
                            err.message
                        );
                }
            )
            
            spawned.on( 'exit', function() {

                closed = true;
                if ( onclose )
                    onclose();
            } );
            
            if ( callback )
                callback( spawned, done );
            else
                done();
        } );
        
        after( function( done ) {

            if ( !closed )
                TestLab.killProcess( spawned.pid, done );
            else
                done();  // already terminated
        } );
    },


    killProcess: function( pid, callback ) {

        process.kill( pid, 'SIGTERM' );
        callback();    
    },

    
    //***** Phantom Web-Browser Emulator Wrapper

    //PhantomJS session wrapper
    webBrowser: function( browser, options, callback ) {
      
        if( !browser )
            throw new Error(
                'Testlab.webBrowser: Must pass `browser` argument'
            );

        if ( !browser.users )
            browser.users = 0;  // initalize counter of "users"

        TestLab.emulateEnv(
            browser,

            function( envCreated ) {

                // create PhantomJS Web Browser
                phantom.create( envCreated, options );
                
            },

            function( err, ph ) {
              
                if ( err )
                    throw new Error(
                        'Testlab.webBrowser: ' +
                        'Failed to create Web Browser; ' +
                        'REASON: ' + err.message
                    );
                
                after( function(done) {

                    if ( !(-- browser.users) ) {
                        browser.active = false; // make reusable
                        TestLab.killProcess( ph.process.pid, done );
                    } else
                        done();
                } );
                
                browser.users ++;
                
                callback.apply( this, arguments );
            }
        );
    },


    // wraps `phantom.createPage` and `page.open` together
    newPageOpen: function( url, _va_args_, callback ) {

        var args = arguments;

        return function ( err, ph ) {

            if ( err )
                throw new Error(
                    'Testlab.webBrowser: ' +
                    'Failed to create PhantomJS web browser: ' +
                    err.message
                );
        
            ph.createPage( function( err, page ) {

                if ( err )
                    throw new Error(
                        'Testlab.newPageOpen: Failed to open page: ' +
                        err.message
                    );

                // generate TestLab.WebPage object
                var response = new TestLab.WebPage();

                response.phantom   = ph;
                response.page      = page;  // phantom page object
                response.resources = { };
                response.expectResources = { };
                
                page.onResourceReceived = function( res ) {

                    if ( res.stage != 'end' )
                        return;
                        
                    if ( res.url == url )
                        response.statusCode = res.status;
                        
                    response.resources[ res.url ] = res;

                    var i, expect, matches;
                    
                    for ( i in response.expectResources ) {
                        expect = response.expectResources[ i ];
                        matches = false;
                        if ( expect.exact ) {
                            if ( res.url == i )
                                matches = true;
                        } else {
                            if (
                                res.url.toString()
                                    .match( expect.regexp )
                            ) {
                                matches = true;
                            }
                        }
                        if ( matches ) {
                            expect.callback( res.url );
                            delete response.expectResources[ i ];
                        }
                    }
                };
                
                var
                    callback = TestLab.setCallback(
                        args,

                        function( err, status ) {
                            if ( err )
                                throw new Error(
                                    'Testlab.newPageOpen.callback: ' +
                                    'Failed; ERROR: ' + err.message
                                );

                            response.status = status;

                            callback( response );
                        }
                    );
                
                page.open.apply( page, args );
            } );
          
        }
    },


    //#### MISC. HELPERS


    //Replaces last element in Arguments object and returns the current 
    setCallback: function( args, newCallback ) {
        var
            argCallbackIdx = args.length - 1,
            callback = args[ argCallbackIdx ];
            
        args[ argCallbackIdx ] = newCallback;
        return callback;
    },


    //Digest the function to arguments of `Function` constructor.
    unmountFunction: function( fn ) {
        var
            fnSourceCode = Function.prototype.toString.call( fn ),
            
            inMatch = fnSourceCode.match(
                /^function[^\(]*\(([^\)]*)\)\s*\{([\s\S]*)\}$/
            );

        return inMatch && {
            args: inMatch[ 1 ],
            body: inMatch[ 2 ]
        };
    },


    //Build function from specification, returned by `unmountFunction`
    mountFunction: function( fn ) {

        return new Function(
            fn.args,
            fn.body
        );
    },


    //Apply a patch to a function. `patcher` should return a digest of
    // new function
    patchFunction: function( target, patch, patcher ) {

        return TestLab.mountFunction( patcher(
            TestLab.unmountFunction( target ),
            TestLab.unmountFunction( patch )
        ) );
    },


    //Wrap a function call to a callback
    makeCallback: function( method ) {

        return function( _va_args_ ) {
          
            var
                object = this,
                args = arguments;
                
            return function() {
                method.apply( object, args );
            }
        }
    }
};


//######## MOCHA-USABLE CLASSES

//Mocha-compatible Encapsulation for webBrowser
P = ( TestLab.WebBrowser = S = function( options ) { // constructor

    var browser = this;
    
    before( function( done ) {
        TestLab.webBrowser( browser, options, function( err, ph ) {
            if ( err )
                throw new Error(
                    'Testlab.webBrowser: ' +
                    'Failed to create PhantomJS web browser: ' +
                    err.message
                );
                
            browser.phantom = ph;
            done();
        } );
    } );
} ).prototype; {


    P.Static = S;


    P.pageOpen = function( _va_args_ ) {

        TestLab.newPageOpen.apply(
            this, arguments
        ) (
            null, this.phantom
        );
    };


    P.pageOpenSuccess = function( _va_args_ ) {

        var
            upstream = TestLab.setCallback( arguments, function( p ) {
              
                if ( p.status != 'success' )
                    throw new Error(
                        'Testlab.WebBrowser.pageOpenSuccess: ' +
                        'Page does not exist.'
                    );
                    
                if ( p.statusCode >= 400 )
                    throw new Error(
                        'Testlab.WebBrowser.pageOpenSuccess: ' +
                        'Page loaded with unexpected status: ' +
                        p.statusCode
                    );
                    
                upstream( p );
            } );
        
        this.pageOpen.apply( this, arguments );
    };


    P.pageOpenSuccessAll = function( _va_args_ ) {

        var
            upstream = TestLab.setCallback( arguments, function( p ) {
              
                if ( p.status != 'success' )
                    throw new Error(
                        'Testlab.WebBrowser.pageOpenSuccessAll: ' +
                        'Page does not exist'
                    );
                    
                if ( p.statusCode >= 400 )
                    throw new Error(
                        'Testlab.WebBrowser.pageOpenSuccessAll: ' +
                        'Page loaded with unexpected status code: ' +
                        p.statusCode
                    );
                    
                for ( var i in p.resources ) {
                    if ( p.resources[ i ].status >= 400 )
                        throw new Error(
                            'Testlab.WebBrowser.pageOpenSuccessAll: ' +
                            'Page resource `' + i +
                            ' failed to load with status code: ' +
                            p.resources[i].status
                        );
                }
                        
                upstream( p );
            } );
        
        this.pageOpen.apply( this, arguments );
    };

      
    S.FAST = { // Default `Fast` configuration for PhantomJS
        phantomPath : phantomjs.path,
        
        parameters  : {
            'load-images'      : 'no',    // don't load images
            'ssl-protocol'     : 'any',
            'ignore-ssl-errors': 'true',
            'local-to-remote-url-access': 'true',
        }
    };


    S.FULL = { // Default `Full` configuration for PhantomJS
        phantomPath : phantomjs.path,
        
        parameters  : {
            'load-images'      : 'yes',    // load images
            'ssl-protocol'     : 'any',
            'ignore-ssl-errors': 'true',
            'local-to-remote-url-access': 'true',
        }
    };
}



//WebPage Class, which object is got from `webBrowser`. 
P = ( TestLab.WebPage = S = function() {
  
    // empty constructor
    
} ).prototype; {


    P.Static = S;


    P.nextPageOpen = function ( _va_args_ ) {

        TestLab.newPageOpen.apply(
            this, arguments
        ) (
            null, this.phantom
        );
    }


    //ATTN: don't remove the comments //'...'// in *Patch functions,
    // they're the targets

    
    S.exceptionCatcherPatch = TestLab.unmountFunction( function() {

        try {
            //'_function_body_'//
        } catch ( exception ) {
            return {
                error : true,
                type  : "Exception",
                json  : JSON.stringify( exception )
            };
        }
    } );


    S.applyExceptionCatcherPatch = function( stuff ) {

        stuff.body = this.exceptionCatcherPatch.body.replace(
            "//'_function_body_'//",
            stuff.body
        );
    }


    S.inputDataPatch = TestLab.unmountFunction( function() {

        var input = '_json_input_data_';
    } )


    S.applyInputDataPatch = function( stuff, input ) {

        stuff.body =
            this.inputDataPatch.body.replace(
                /'_json_input_data_'/g,
                JSON.stringify( input || null )
            ) + stuff.body;
    }


    P.clientEvaluate = function( clientFunction, input, resultCallback ) {

        var stuff = TestLab.unmountFunction( clientFunction );
        
        this.Static.applyInputDataPatch( stuff, input );
        this.Static.applyExceptionCatcherPatch( stuff );

        var patchedClientFunction = TestLab.mountFunction( stuff );
            
        this.page.evaluate( patchedClientFunction, resultCallback )
    }


    P.clientTest = function( clientFunction, input, done ) {
      
        this.clientEvaluate(
        
            clientFunction,
            input,

            function( err, whatFailed ) {
              
                if ( err )
                    throw new Error(
                        'TestLab.WebPage: ' +
                        'PhantomJS client evaluation error: ' +
                        err
                    );
                    
                if ( whatFailed ) {
                    if ( whatFailed.error )
                        throw new Error(
                            'TestLab.WebPage: Client-side Error: ' +
                            whatFailed.type +
                            ': ' +
                            JSON.parse( whatFailed.json ).message
                        );
                        
                    if ( typeof whatFailed == 'string' )
                        throw new Error(
                            'TestLab.WebPage: Test failed: ' +
                            whatFailed
                        );
                        
                    throw new Error(
                        'TestLab.WebPage: ' +
                        'Unexpexted object returned: ' +
                        JSON.stringify( whatFailed )
                    );
                }
                
                done();
            }
        );
    }


    P.expectNothing = function() {
      
        this.expectResources = { };
    }


    P.expectResource = function( url, options, callback ) {
      
        var
            exact  = !options.prefix && !options.suffix,
            
            regexp = !exact && new RegExp(
                ( options.prefix ? '' : '^' ) +
                RegExp.escape( url ) +
                ( options.suffix ? '' : '$' )
            );

        this.expectResources[ url ] = {
            exact    : exact,
            regexp   : regexp,
            callback : callback,
        };
    }


    P.expectOnlyResource = function( _same_as_for_expectResourse_ ) {
      
        this.expectNothing();
        this.expectResource.apply( this, arguments );
    }

    P.expectClientTest = function( clientFunction, input, done ) {
      
        var
            me   = arguments.callee,
            obj  = this,
            args = arguments;
            
        this.clientEvaluate(
            clientFunction,
            input,

            function( err, result ) {
              
                if ( err )
                    throw new Error(
                        'TestLab.WebPage: ' +
                        'PhantomJS client evaluation error: ' +
                        err
                    );
                    
                if ( result ) {
                    if ( result.error ) {
                        if ( result.type == 'terminate' )
                            done(true);
                        else
                            throw new Error(
                                'TestLab.WebPage: ' +
                                'Client-side Error: ' + result.type +
                                ': ' +
                                JSON.parse( result.json ).message
                            );
                    } else {
                        setTimeout(
                            function() {
                              
                                me.apply( obj, args );
                            },

                            (
                                this.wait ||
                                TestLab.defaults.waitForRetry ||
                                100
                            )
                        );
                    }
                } else
                    done();
            }
        )
    }


    P.expectClientExpression = function( expr, input, done ) {
      
        this.expectClientTest(
            new Function( 'return !(' + expr + ');' ),
            input,
            done
        );            
    }


    S.clientTestSelectorFunction = function() {
      
        return (
            !document.querySelector( input.selector )
        ) && (
            'TestLab: selector is not found: ' +
            input.selector
        );
    }


    S.clientTestReadyFunction = function() {
      
        return (
            document.readyState != 'complete'
        ) && (
            'TestLab: document loading is not complete, ' +
            'it\'s readyState is' +
            document.readyState
        );
    }


    P.expectClientSelector = function( selector, done ) {
      
        this.expectClientTest(
            this.Static.clientTestSelectorFunction,
            { selector: selector },
            done
        );
    }


    P.expectClientReady = function( done ) {
      
        this.expectClientTest(
            this.Static.clientTestReadyFunction,
            { },
            done
        );
    }


    P.assertClientSelector = function( selector, done ) {
      
        this.clientTest(
            this.Static.clientTestSelectorFunction,
            { selector: selector },
            done
        );
    }


    P.assertClientReadySelector = function ( selector, done ) {
      
        var me = this;
        
        me.expectClientReady( function() {
           me.assertClientSelector( selector, done );
        } )
    }


    S.clientFormFillFunction = function() {
      
        form = document.querySelector( input.form );

        if ( !form )
            return (
                'TestLab: form is not found by selector: ' +
                input.selector
            );
        
        var
            i, j, k,
            all, element, bunch, value,
            
            values    = input.values,
            fields    = { };

        if ( values ) {
            all = form.querySelectorAll( 'input,textarea,select' );
            if ( all ) {
                if ( !( values instanceof Array ) )
                    values = [ values ];
                    
                for ( i = 0; i < all.length; i ++ ) {
                    element = all[ i ];
                    if ( !( element.name in fields ) )
                        fields[ element.name ] = [ element ];
                    else fields[ element.name ].push( element );
                }
                
                for ( i = 0; i < values.length; i ++ ) {
                    bunch = values[ i ];
                    for ( j in bunch ) {
                        if ( j in fields ) {
                            element = fields[ j ].shift();
                            if ( element ) {
                                value = bunch[ j ];
                                switch ( element.tagName ) {
                                  
                                    case 'INPUT':
                                        switch (
                                            element.type.toUpperCase()
                                        ) {
                                          
                                            case 'CHECKBOX':
                                                if (
                                                    !element.checked ^
                                                    !value
                                                )
                                                    element.click();
                                                    
                                                break;
                                                
                                            case 'RADIO':
                                                do {
                                                    if (
                                                        value ==
                                                        element.value
                                                    ) {
                                                        element.click();
                                                        break;
                                                    }
                                                } while ((
                                                    element =
                                                    fields[ j ].shift()
                                                ));
                                                                                                    
                                                break;
                                                
                                            default:
                                                element.value = value;
                                                break;
                                        }
                                        break;
                                        
                                    case 'TEXTAREA':
                                        element.value = value;
                                        break;
                                        
                                    case 'SELECT':
                                        all = element.querySelectorAll(
                                            'option'
                                        );
                                        
                                        for (
                                            k = 0;
                                            k < all.length;
                                            k ++
                                        ) {
                                            if (
                                                all[ k ].value ==
                                                value
                                            ) {
                                                all[ k ].selected =
                                                    true;
                                                    
                                                break;
                                            }
                                        }
                                        
                                        break;
                                }
                                //'_apply_changes_'//
                            }
                        }
                    }
                }
            }
        }
        
        if ( input.submit ) {
            if ( typeof input.submit == 'string' ) {
                var
                    i,

                    submits = form.querySelectorAll(
                        '*[type="submit"]'
                    );
                    
                for ( i in submits ) {
                    if ( submits[ i ].name == input.submit ) {
                        submits[ i ].click();
                        return;
                    }
                }

                return (
                    'TestLabAngular.clientFormSubmit: ' +
                    'Form does not contain submit control with name: ' +
                    input.submit
                )
                
            } else {
                var submit = form.querySelector( '*[type="submit"]' );
                
                if ( submit )
                    submit.click();
                else
                    form.submit();
            }
        }
    };


    S.clientFormFillFunctionPatches = {
      
        addApplyChangesPatch: function( patchStuff ) {
          
            var stuff = TestLab.unmountFunction(
                TestLab.WebPage.clientFormFillFunction
            );
            
            stuff.body = stuff.body.replace(
                /(?=\/\/'_apply_changes_'\/\/)/g,
                patchStuff.body
            );

            TestLab.WebPage.clientFormFillFunction =
                TestLab.mountFunction( stuff );
        },
        
    }


    P.clientFormFill = function( input, done ) {
      
        this.clientTest(
            this.Static.clientFormFillFunction,
            input,
            done
        );
    }


    P.clientReadyFormFill = function( input, done ) {
      
        var me = this;
        
        expectSelector();

        function expectSelector() {
          
            me.expectClientSelector(
                input.readySelector || input.form,
                expectExpression
            );
        }

        function expectExpression() {
          
            if ( input.readyExpression ) {
                me.expectClientExpression(
                    input.readyExpression,
                    input,
                    formFill
                );
            } else
                formFill();
        }

        function formFill() {
          
            me.clientFormFill( input, done );
        }
    }

    
    P.close = function( callback ) {
      
        if ( this.page.stop )
            this.page.stop();
            
        this.page.close();
        
        if ( callback )
            callback();
    }


    P.thenClose = TestLab.makeCallback( P.close );

}


//##### REGEXP ESCAPE


if ( !RegExp.escape ) {
    RegExp.escape = function(s) {
      
        return s.replace(
            /[-\"\'\/\\^$*+?.()|[\]{}]/g,
            '\\$&'
        );
    };
}


//##### EXPORTS


module.exports = TestLab;

} ) () // Safety Padding
