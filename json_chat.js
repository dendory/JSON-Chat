//
// JSON Chat: A simple JSON-based Node.js chat client.
//
var http = require("http");
var url = require("url");
var query = require("querystring");
var crypto = require('crypto');

var appname = "JSON Chat";
var version = "0.01";
var p, q, res, req, body;
var users = {};
var posts = [];
var messages = [];
var rexp = /^[\.0-9a-zA-Z_-]+$/;
var port = "8080";
var debug = 0;   // debug mode
var allow_html = 0;   // allow HTML posts
var json = {};
var errors = 
{
	"ERR_MISSING_USER": "Missing user value.",
	"ERR_INVALID_USER": "The user name should only contain alphanumeric characters.", 
	"ERR_EXISTING_USER": "The user name already exists.",
	"ERR_RESOURCE_NOT_FOUND": "The requested resource was not found.",
	"ERR_MISSING_KEY": "You must call /register/ first and pass on the returned key value to this resource.",
	"ERR_INVALID_KEY": "The specified key is not valid. Call /register/ first to register a user and obtain a valid key.",
	"ERR_MISSING_DATA": "Missing data value.",
};
var html_headers = "\
<!DOCTYPE html>\
<html lang='en'>\
 <head>\
  <meta charset='utf-8'>\
  <meta http-equiv='X-UA-Compatible' content='IE=edge'>\
  <meta name='viewport' content='width=device-width, initial-scale=1'>\
  <title>" + appname + "</title>\
  <link rel='stylesheet' href='https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap.min.css'>\
  <link rel='stylesheet' href='https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap-theme.min.css'>\
  <script src='https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/js/bootstrap.min.js'></script>\
 </head>\
 <body>\
  <div class='container'><br>\
";
var html_footers = "\
  </div>\
 </body>\
</html>\
";
var html_main = "\
   <div class='jumbotron'>\
   <h1>" + appname + "</h1>\
   <p>This is the main page of a simple JSON-based chat application. From here, you can accesss a Bootstrap web client, or access the JSON API directly.</p>\
   <p><a href='http://github.com/dendory' class='btn btn-primary btn-lg' role='button'>Learn more &raquo;</a></p>\
   </div>\
   <h2>Web client</h2>\
   <center>\
   <h3>Please enter a user name:</h3>\
   <form style='max-width: 330px;' role='form' method='GET' action='.'>\
   <input type='text' class='form-control' style='margin-bottom: 10px;' name='user' placeholder='User name' required autofocus>\
   <button class='btn btn-lg btn-primary btn-block' type='submit'>Load client</button>\
   </form></center><br>\
   <h2>Direct API access</h2>\
   <table class='table'>\
   <tr><th>Resource</th><th>Description</th></tr>\
   <tr><td><a href='/help/'>/help/</a></td><td>API usage information</td></tr>\
   <tr><td><a href='/register/'>/register/</a></td><td>Register a user</td></tr>\
   <tr><td><a href='/users/'>/users/</a></td><td>See a list of users</td></tr>\
   <tr><td><a href='/post/'>/post/</a></td><td>Post a message to the public feed</td></tr>\
   <tr><td><a href='/feed/'>/feed/</a></td><td>View the public feed</td></tr>\
";

// Main loop
function process_request()
{
	json =
	{
		"app": appname,
		"version": version,
		"status": "",
		"message": "",
	};
	if(p == "/register/")   // Register a user
	{
		if(!q['user']) err(400, "ERR_MISSING_USER");
		else if(!rexp.test(q['user'])) err(400, "ERR_INVALID_USER");
		else if(users[q['user']]) err(400, "ERR_EXISTING_USER");
		else
		{
			json["status"] = "OK";
			json["message"] = "New user registered.";
			json["key"] = register_user(q['user']);
			res.writeHead(200, {"Content-Type": "application/json"});
		}
	}
	else if(p == "/post/")    // Post a message
	{
		if(!q['key']) err(400, "ERR_MISSING_KEY");
		else if(!q['data']) err(400, "ERR_MISSING_DATA");
		else if(!find_user(q['key'])) err(400, "ERR_INVALID_KEY");
		else
		{
			post(q['key'], q['data']);
			res.writeHead(200, {"Content-Type": "application/json"});
			json["status"] = "OK";
			json["message"] = "Post added to the feed.";
		}
	}
	else if(p == "/feed/")   // see all messages
	{
		var tmpfeed = [];
		for(i=0; i<posts.length; i++)
		{
			if(!q['since'] || parseInt(posts[i]['time']) > parseInt(q['since']))
			{ tmpfeed.push({"time": posts[i]['time'], "user": posts[i]['user'], "data": posts[i]['data'], "index": posts[i]['index']}); }
		}
		json['feed'] = tmpfeed;
	}
	else if(p == "/users/")   // see all users
	{
		var tmpusers = [];
		for(var i in users) tmpusers.push(i);
		json["users"] = tmpusers;
		res.writeHead(200, {"Content-Type": "application/json"});
		json["status"] = "OK";
		json["message"] = "List of users.";
	}
	else if(p == "/help/")    // help page
	{
		res.writeHead(200, {"Content-Type": "application/json"});
		json["status"] = "OK";
		json["message"] = "This page contains lists of available API commands, expected values, returned values, and error codes.";
		json["api"] = [
		{
			"endpoint": "/register/",
			"description": "Register a new user.",
			"input": "user",
			"output": "status message key",
		},
		{
			"endpoint": "/feed/",
			"description": "See the public posts.",
			"input": "since",
			"output": "status message feed[]",
		},
		{
			"endpoint": "/users/",
			"description": "See a list of users.",
			"input": "",
			"output": "status message users[]",
		},
		{
			"endpoint": "/post/",
			"description": "Post a public message.",
			"input": "key data",
			"output": "status message",
		}];
		json["errors"] = errors;
	}
	else if(p == "/") // main page
	{
		res.writeHead(200, {"Content-Type": "text/html"});
		res.write(html_headers);
		if(!q['user'] && !q['key'])
		{
			res.write(html_main);
		}
		else
		{
			var client_key;
			if(q['user'] && !rexp.test(q['user'])) res.write("<div class='alert alert-danger' role='alert'><b>Error:</b> " + errors["ERR_INVALID_USER"] + "</div><p><a href='/'>Home page</a></p>");
			else if(q['user'] && users[q['user']]) res.write("<div class='alert alert-danger' role='alert'><b>Error:</b> " + errors["ERR_EXISTING_USER"] + "</div><p><a href='/'>Home page</a></p>");
			else if(q['user']) { client_key = register_user(q['user']); }
			else if(!find_user(q['key'])) res.write("<div class='alert alert-danger' role='alert'><b>Error:</b> " + errors["ERR_INVALID_KEY"] + "</div><p><a href='/'>Home page</a></p>");
			else { client_key = q['key']; }
			if(client_key)
			{
				if(q['data']) post(client_key, q['data']);
				res.write("<script>var key = '" +  client_key + "';</script>");
				res.write("<div class='alert alert-success' role='alert'><b>Success!</b> You are now connected.</div>");
				res.write("<div class='row'><div class='col-sm-8'>");
				res.write("<div class='list-group'><h2>Feed</h2>");
				for(i=0; i<posts.length; i++)
				{
					var norm_time = new Date(posts[i]['time'] * 1000).toUTCString();
					res.write("<div class='list-group-item'><h4 class='list-group-item-heading'>" + posts[i]['user'] + " - " + norm_time + "</h4><p class='list-group-item-text'>" +  posts[i]['data'] + "</p></div>"); 
				}
				res.write("</div></div><div class='col-sm-4'>");
				res.write("<div class='list-group'><h2>Post to feed</h2><div class='list-group-item'><form role='form' action='.' method='POST'><input style='margin-bottom: 10px;' class='form-control' type='text' name='data'><input type='hidden' name='key' value='" + client_key + "'><button class='btn btn-lg btn-primary btn-block' type='submit'>Post</button></form></div></div>");
				res.write("<div class='list-group'><h2>Refresh page</h2><div class='list-group-item'><form role='form' action='.' method='POST'><input type='hidden' name='key' value='" + client_key + "'> <button class='btn btn-lg btn-primary btn-block' type='submit'>Refresh</button></form></div></div>");
				res.write("<ul class='list-group'><h2>List of users</h2>");
				for(var j in users) res.write("<li class='list-group-item'>" + j + "</li>");
				res.write("</ul>");
				res.write("<a href='/'>Home page</a></div></div>");
			}
		}
		res.write(html_footers);
		return;
	}
	else   // URL not found
	{
		err(404, "ERR_RESOURCE_NOT_FOUND");
	}
	res.write(JSON.stringify(json, null, 4));		
}

// Post data
function post(key, tmpdata)
{
	var tmpuser = find_user(key);
	if(allow_html == 0) tmpdata = tmpdata.replace(/</g, '&lt;').replace(/>/g, '&gt;');
	console.log(unixtime() + ": New post: <" + tmpuser + "> " + tmpdata + " [" + req.connection.remoteAddress + "]");
	posts.push({"ip": req.connection.remoteAddress, "time": unixtime(), "user": tmpuser, "data": tmpdata, "index": rand_chars(64)});
}
			
// Register a user
function register_user(user)
{
	console.log(unixtime() + ": New user registered: " + user + " [" + req.connection.remoteAddress + "]");
	var tmpuser = rand_chars(64);
	users[user] = tmpuser;
	return tmpuser;
}

// Output an error
function err(code, status)
{
	json["status"] = status;
	json["message"] = errors[status];
	res.writeHead(code, {"Content-Type": "application/json"});
}

// Check for a user based on key
function find_user(key)
{
	for(var i in users)
	{
		if(users[i] == key) return i;
	}
	return false;
}

// Create random characters
function rand_chars(length)
{
	var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var result = '';
	for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
	return result;
}
  
// Return unixtime value
function unixtime()
{
	return parseInt((new Date).getTime() / 1000);
}

// Handle a request
function onreq(request, response)
{
	req = request;
	res = response;
	p = url.parse(req.url).pathname;
	if(p.slice(-1) != "/") { p = p + "/"; }
	if(debug == 1) console.log(unixtime() + ": Request for " + p + " [" + req.connection.remoteAddress + "]");
	body = '';
	req.on('data', function (data) 
	{
		body += data;
		if (body.length > 1e6) { req.connection.destroy(); }
	});
	req.on('end', function () 
	{
		if(req.method == 'POST')
		{
			q = query.parse(body); // Load q from POST data
			process_request();
			res.end();
		}
	});
	if(req.method != 'POST')
	{
		q = query.parse(req.url.split('?')[1]);  // Load q from GET data
		process_request();
		res.end();
	}
}

// Create server
http.createServer(onreq).listen(port);
console.log(unixtime() + ": " + appname + " " + version + " started on port " + port + ".");
