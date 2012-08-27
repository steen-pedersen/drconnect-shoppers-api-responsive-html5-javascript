var ns = namespace('dr.api.connection');

/**
 * This object is for getting a Session for connecting
 * @returns {Session}
 */
ns.Session = function(apikey, isDummy, authOptions){
    this.apikey = apikey;
        
    // Check if we want to load the DummyConnection or the real one
    if(isDummy == "1") {
    	this.connection = new dr.api.connection.DummyConnection();
    	this.authManager = new dr.api.auth.DummyAuthManager();
    } else {
    	this.connection = new dr.api.connection.Connection();
    	this.authManager = new dr.api.auth.AuthManager(dr.api.connection.URI.BASE_URL + dr.api.connection.URI.LOGIN, authOptions);	
    }
    
    this.token = null;
    this.refresh_token = null;
    this.connected = false;
    this.authenticated = false;
    this.tokenStartTime = null;
    this.tokenExpirationTime = null;
}

/**
 * Creates a new error promise with the specified error message
 */
ns.Session.prototype.createErrorPromise = function(message) {
    console.log("Operation not allowed: " + message);
    var d = Q.defer();
    d.reject(message);
    return d.promise;
}

/**
 * Creates a new error promise indicating the user must be connected before using the API
 */
ns.Session.prototype.createDisconnectedError = function() {
    return this.createErrorPromise("You must be connected to the server in order to use the API")
}

/**
 * Connection.create
 */
ns.Session.prototype.create = function(uri, urlParams){

    // Check if session is logged in
    if(!this.connected){
        return this.createDisconnectedError();
    }
    
    // Http Request Header fields for all Creations
    var headerParams = {};
    headerParams['Authorization'] = 'bearer ' + this.token;
    
    var promise = this.connection.create(uri, urlParams, headerParams)
                   .then(function(data) {
                       for(var name in data) {
                           if(name) {
                               return data[name];
                           }
                       }
                   });
    
    return promise;
}

/**
 * Connection.retrieve
 */
ns.Session.prototype.remove = function(uri, urlParams){

    // Check if session is logged in
    if(!this.connected){
       return this.createDisconnectedError();
    }
    
    // Http Request Header fields for all Retrieves
    var headerParams = {};
    headerParams['Authorization'] = 'bearer ' + this.token;
    
    if(!urlParams) {
        urlParams = {};
    }
    urlParams.client_id = this.apikey;
    
    var promise = this.connection.remove(uri, urlParams, headerParams)
                   .then(function(data) {
                       for(var name in data) {
                           if(name) {
                               return data[name];
                           }
                       }
                   });
    return promise;
}

/**
 * Connection.retrieve
 */
ns.Session.prototype.retrieve = function(uri, urlParams){

    // Check if session is logged in
    if(!this.connected){
        return this.createDisconnectedError();
    }
    
    // Http Request Header fields for all Retrieves
    var headerParams = {};
    headerParams['Authorization'] = 'bearer ' + this.token;
    
    if(!urlParams) {
        urlParams = {};
    }
    urlParams.client_id = this.apikey;
    
    var self = this;
    var promise = this.connection.retrieve(uri, urlParams, headerParams)
                   .then(function(data) {
                       for(var name in data) {
                           if(name) {
                               return data[name];
                           }
                       }
                   });
    /*
    if(urlParams.expand && urlParams.expand !== "") {
        promise = this.handleExpansion(promise, urlParams.expand);
    }
    */
    return promise;
}

ns.Session.prototype.errorHandle = function(response) {
}

/**
 * Performs an anonymous authentication to the DR Server.
 * This should always be the first step in the session (required to use anonymous APIs and also to authenticate)
 */
ns.Session.prototype.anonymousLogin = function() {
    
    var uri = dr.api.connection.URI.BASE_URL + dr.api.connection.URI.ANONYMOUS_LOGIN;
    var that = this;
    
    var d = new Date();
    
    if(this.refresh_token){
    	return this.refreshToken();	
    }
    
    var fields = {"client_id": this.apikey, "ts": d.getTime(), "grant_type": "password", "username": "anonymous", "password": "anonymous"};
    
    return this.connection.submitForm(uri, fields,{})
        .then(function(data){
            that.connected = true;
            that.token = data.access_token;
            that.refresh_token = data.refresh_token;
            console.debug("[DR Api Library] Anonymous token obtained: " + that.token);
            that.tokenStartTime = new Date().getTime()/1000;
            that.tokenExpirationTime = new Date().getTime()/1000 + parseInt(data.expires_in);
            return data;
        });
};

/**
 * Refresh an anonymous token authentication to the DR Server.
*/
ns.Session.prototype.refreshToken = function() {
    
    var uri = dr.api.connection.URI.BASE_URL + dr.api.connection.URI.ANONYMOUS_LOGIN;
    var that = this;
    
    var d = new Date();
    
    var fields = {"client_id": this.apikey, "ts": d.getTime(), "grant_type": "refresh_token", "refresh_token": this.refresh_token};
    
    return this.connection.submitForm(uri, fields, {})
        .then(function(data){
            that.connected = true;
            that.token = data.access_token;
            that.refresh_token = data.refresh_token;
            console.debug("[DR Api Library] Anonymous token obtained using Refresh Token: " + that.token);
            that.tokenStartTime = new Date().getTime()/1000;
            that.tokenExpirationTime = new Date().getTime()/1000 + parseInt(data.expires_in);
            return data;
        });
};


/**
 * Triggers the OAuth flow in order to get credentials from the user and authenticate him/her
 * This will allow to use protected APIs (such as GetShopper)
 */
ns.Session.prototype.authenticate = function(onViewLoadedCallback) {
    var self = this;
    
    // Check if session is logged in
    if(!this.connected){
        return this.createDisconnectedError();
    }
    
    var p = this.authManager.login(this.token, onViewLoadedCallback);
    p.then(function(data) {
            if(data.token != "") {
                self.token = data.token;
                self.authenticated = true;
                self.refresh_token = null;
                self.tokenStartTime = new Date().getTime()/1000;
            	self.tokenExpirationTime = new Date().getTime()/1000 + parseInt(data.expires_in);
                console.debug("[DR Api Library] Authenticated token obtained: " + self.token);
            }
            return data.token;
        });  
    
    return p;
};

/**
 * Disconnects from the service by clearing the session data
 */
ns.Session.prototype.disconnect = function() {
    this.token = null;
    this.authenticated = false;
    this.connected = false;
    
    var defer = Q.defer();
    defer.resolve();
    return defer.promise;
}

/**
 * Ends the session by clearing the session data and starting an anonymous one.
 */
ns.Session.prototype.logout = function() {
    if(!this.connected){
        return this.createDisconnectedError();
    }
    if(this.authenticated) {
        // User is authenticated, forget the token and create an anonymous session
        this.token = null;
        this.authenticated = false;
        
        return this.anonymousLogin();
    } else {
        // User is anonymous already, do nothing
        var defer = Q.defer();
        defer.resolve();
        return defer.promise;
    }
    
}

/**
 * Temporary implementation of the 'expand' param due to a workInProgress by Apigee
 */
ns.Session.prototype.handleExpansion = function(promise, attribute) {
    var that = this;
    
    return promise
            .then(function(data) { 
                    return that.expand(data, attribute);
            }); 
}

ns.Session.prototype.expand = function(result, attribute) {
    var that = this;
    var entity = getAttribute(result, attribute);
    var promises = [];
    var isArray = is_array(entity); 
    if(isArray) {
        for(var i = 0; i < entity.length; i++) {
            var o = entity[i];
            promises.push(that.retrieve(o.uri, {}));
        }
    } else {
         promises.push(that.retrieve(entity.uri, {}));
    }
    return Q.all(promises)
        .then(function(results) {
            if(isArray) {
                setAttribute(result, attribute, []);
                var entity = getAttribute(result, attribute);
                for(var i = 0; i < results.length; i++) {
                    entity.push(results[i]);    
                }
            } else {
                setAttribute(result, attribute, results[0]);
            }
            return result;
        });
}
