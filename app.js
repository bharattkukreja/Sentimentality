var express = require('express');
var path = require('path');
var sentiment = require('sentiment');
var twitter = require('ntwitter');
var bodyParser = require('body-parser');

var port = 3000;
var stream;

var app = express();

process.on('uncaughtException', function (err) {
    console.error('Caught exception: ' + err.stack);
});
process.on("exit", function(code) {
    console.log("exiting with code: " + code);
});

app.use(express.static(__dirname + '/'));

var tweeter = new twitter({
	consumer_key: 'NOT MAKING MY KEY PUBLIC',
	consumer_secret: 'NOT MAKING MY KEY PUBLIC',
	access_token_key: 'NOT MAKING MY KEY PUBLIC',
	access_token_secret: 'NOT MAKING MY KEY PUBLIC'
});

app.get('/twitterCheck', function (req, res) {
	tweeter.verifyCredentials(function (error, data) {
		res.send("Hello, " + data.name + ".  I am in your twitters.");
	});
});

var tweetCount = 0;
var tweetTotalSentiment = 0;
var monitoringPhrase;

app.get('/sentiment', function (req, res) {
	res.json({monitoring: (monitoringPhrase != null),
		monitoringPhrase: monitoringPhrase,
		tweetCount: tweetCount,
		tweetTotalSentiment: tweetTotalSentiment,
		sentimentImageURL: sentimentImage()});
	});

	app.post('/sentiment', function (req, res) {
		try {
			if (req.body.phrase) {
				beginMonitoring(req.body.phrase);
				res.send(200);
			} else {
				res.status(400).send('Invalid request: send {"phrase": "trump"}');
			}
		} catch (exception) {
			res.status(400).send('Invalid request: send {"phrase": "trump"}');
		}
	});

	function resetMonitoring() {
		if (stream) {
			var tempStream = stream;
			stream = null;  // signal to event handlers to ignore end/destroy
			tempStream.destroySilent();
		}
		monitoringPhrase = "";
	}

	function beginMonitoring(phrase) {

		if (monitoringPhrase) {
			resetMonitoring();
		}
		monitoringPhrase = phrase;
		tweetCount = 0;
		tweetTotalSentiment = 0;
		tweeter.verifyCredentials(function (error, data) {
			if (error) {
				resetMonitoring();
				console.error("Error connecting to Twitter: " + error);
			} else {
				tweeter.stream('statuses/filter', {
					'track': monitoringPhrase
				}, function (inStream) {
					stream = inStream;
					console.log("Monitoring Twitter for " + monitoringPhrase);
					stream.on('data', function (data) {

						if (data.lang === 'en') {
							sentiment(data.text, function (err, result) {
								tweetCount++;
								tweetTotalSentiment += result.score;
							});
						}
					});
					stream.on('error', function (error, code) {
						console.error("Error received from tweet stream: " + code);
						if (code === 420)  {
							console.error("API limit hit, are you using your own keys?");
						}
						resetMonitoring();
					});

					stream.on('end', function (response) {
						if (stream) { // if we're not in the middle of a reset already
						// Handle a disconnection
						console.error("Stream ended unexpectedly, resetting monitoring.");
						resetMonitoring();
					}
				});

				stream.on('destroy', function (response) {
					// Handle a 'silent' disconnection from Twitter, no end/error event fired
					console.error("Stream destroyed unexpectedly, resetting monitoring.");
					resetMonitoring();
				});
			});
			return stream;
		}
	});
}

function sentimentImage() {
	var avg = tweetTotalSentiment / tweetCount;
	if (avg > 0.5) {
		return "images/excited.jpg";
	}
	if (avg < -0.5) {
		return "images/angry.png";
	}
	return "images/content.png";
}

app.get('/',
function (req, res) {
	var welcomeResponse = (path.join(__dirname + '/testSentiment.html'));
	if (!monitoringPhrase) {
		res.sendFile(welcomeResponse);
	} else {
		var monitoringResponse = "<HEAD>" +
		"<META http-equiv=\"refresh\" content=\"5; URL=http://" +
		req.headers.host +
		"/\">\n" +
		"<title>Twitter Sentiment Analysis</title>\n" +
		"</HEAD>\n" +
		"<BODY>\n" +
		"<P>\n" +
		"The Twittersphere is feeling<br>\n" +
		"<IMG align=\"middle\" src=\"" + sentimentImage() + "\"/><br>\n" +
		"about " + monitoringPhrase + ".<br><br>" +
		"Analyzed " + tweetCount + " tweets...<br>" +
		"</P>\n" +
		"<A href=\"/reset\">Monitor another phrase</A>\n" +
		"</BODY>";
		res.send(monitoringResponse);
	}
});

app.get('/monitor', function (req, res) {
	beginMonitoring(req.query.phrase);
	res.redirect(302, '/');
});

app.get('/reset', function (req, res) {
	resetMonitoring();
	res.redirect(302, '/');
});

app.get('/watchTwitter', function (req, res) {
	var stream;
	var testTweetCount = 0;
	var phrase = monitoringPhrase;

	tweeter.verifyCredentials(function (error, data) {
		if (error) {
			res.send("Error connecting to Twitter: " + error);
		}
		stream = tweeter.stream('statuses/filter', {
			'track': phrase
		}, function (stream) {
			res.send("Monitoring Twitter for \'" + phrase + "\'...  Logging Twitter traffic.");
			stream.on('data', function (data) {
				testTweetCount++;
				// Update the console every 10 analyzed tweets
				if (testTweetCount % 10 === 0) {
					console.log("Tweet #" + testTweetCount + ":  " + data.text);
				}
			});
		});
	});
});

app.listen(port);
console.log("Server listening on port " + port);
