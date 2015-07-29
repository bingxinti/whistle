var iconv = require('iconv-lite');
var zlib = require('zlib');
var MAX_REQ_SIZE = 256 * 1024;
var MAX_RES_SIZE = 512 * 1024;
var TIMEOUT = 36000;
var CLEAR_INTERVAL = 5000;
var CACHE_TIME = CLEAR_INTERVAL * 2;
var MAX_LENGTH = 512;
var MIN_LENGTH = 412;
var COUNT = 100;
var count = 0;
var ids = [];
var data = {};
var proxy, binded, timeout, interval, util;

function disable() {
	proxy.removeListener('request', handleRequest);
	proxy.removeListener('tunnel', handleTunnel);
	proxy.removeListener('tunnelProxy', handleTunnelProxy);
	proxy.removeListener('websocket', handleWebsocket);
	
	ids = [];
	data = {};
	interval && clearInterval(interval);
	interval = null;
	binded = false;
}

function enable() {
	if (!binded) {
		proxy.on('request', handleRequest);
		proxy.on('tunnel', handleTunnel);
		proxy.on('tunnelProxy', handleTunnelProxy);
		proxy.on('websocket', handleWebsocket);
	}
	
	binded = true;
	clearTimeout(timeout);
	timeout = setTimeout(disable, TIMEOUT);
	if (!interval) {
		interval = setInterval(clearCache, CLEAR_INTERVAL);
	}
}

/**
 * 如果超过最大缓存数，清理如下请求数据：
 * 1. 已经请求结束且结束时间超过10秒
 * 2. 请求#1前面的未结束且未被ui读取过的请求
 */
function clearCache() {
	var len = ids.length;
	if (len <= MAX_LENGTH) {
		return;
	}
	
	var index = -1; //已经完成，且缓存超过10s的最后一个请求
	var now = Date.now();
	for (var i = len - 1; i >= 0; i--) {
		var curData = data[ids[i]];
		if (curData.endTime && now - curData.endTime > TIMEOUT) {
			index = i;
			break;
		}
	}
	
	if (index < 0) {
		return;
	}
	
	var _ids = [];
	var end;
	++index;
	for (var i = 0; i < index; i++) {
		var id = ids[i];
		var curData = data[id];
		if (curData.read && (!curData.endTime || now - curData.endTime < CACHE_TIME 
				|| now - curData.startTime < TIMEOUT)) {
			_ids.push(id);
		} else {
			delete data[id];
			if (--len <= MIN_LENGTH) {
				_ids.push.apply(_ids, ids.slice(i + 1, index));
				break;
			}
		}
	}
	ids = _ids.concat(ids.slice(index));
}


function passThrough(chunk, encoding, callback) {
	callback(null, chunk);
}

function decode(body) {
	if (body) {
		var _body = body + '';
		if (_body.indexOf('�') != -1) {
			_body = iconv.decode(body, 'gbk');
		}
		body = _body;
	}
	
	return body;
}

function get(options) {
	enable();
	options = options || {};
	var data = {};
	var newIds = options.startTime == -1 ? [] : getIds(options.startTime, options.count);
	var list = getList(newIds).concat(getList(options.ids));
	for (var i = 0, len = list.length; i < len; i++) {
		var item = list[i];
		if (item) {
			data[item.id] = item;
		}
	}
	
	return {
		ids: options.ids || [],
		newIds: newIds,
		data: data
	};
}

function getIds(startTime, count) {
	var len = ids.length;
	if (!len) {
		return [];
	}
	
	startTime = ((startTime || Date.now() - 6000) + '').split('-');
	count = Math.min(count || COUNT, len);
	
	startTime[0] = parseInt(startTime[0], 10) || 0;
	startTime[1] = parseInt(startTime[1], 10) || 0;
	
	if (compareId(ids[0], startTime)) {
		
		return ids.slice(0, count);
	}
	
	var end = len - 1;
	if (!end || !compareId(ids[end], startTime)) {
		
		return  [];
	}
	
	var index = getIndex(startTime, 0, end);
	return ids.slice(index, index + count);
}

function compareId(curId, refId) {
	curId = curId.split('-');
	return curId[0] > refId[0] || (curId[0] == refId[0] && curId[1] > refId[1]);
}

function getIndex(startTime, start, end) {
	if (end - start <= 1) {
		return compareId(ids[start], startTime) ? start : end;
	}
	
	var mid = Math.floor((start + end) / 2);
	var id = ids[mid];
	return compareId(id, startTime) ? getIndex(startTime, start, mid) : getIndex(startTime, mid + 1, end);
}

function getList(ids) {
	var result = [];
	for (var i = 0, len = ids && ids.length; i < len; i++) {
		var id = ids[i];
		var curData = data[id];
		if (curData) {
			curData.read = true;
			result[i] = curData;
		}
	}
	
	return result;
}

function handleTunnel(req) {
	handleTunnelRequest(req, true);
}

function handleTunnelProxy(req) {
	handleTunnelRequest(req);
}

function handleTunnelRequest(req, isHttps) {
	var startTime = Date.now();
	var id = startTime + '-' + ++count;
	
	ids.push(id);
	
	var curData = data[id] = {
			id: id,
			url: util.removeProtocol(req.url, true),
			isHttps: true,
			isHttpsProxy: !isHttps,
			startTime: startTime,
			req: {
				method: req.method && req.method.toUpperCase() || 'CONNECT', 
				httpVersion: req.httpVersion || '1.1',
	            ip: util.getClientIp(req) || '::ffff:127.0.0.1',
	            headers: req.headers
			},
			res: {
				headers: {}
			},
			rules: req.rules
	};
	
	req.on('error', handleError);
	req.on('send', update);
	req.on('response', handleResponse);
	
	function handleError(err) {
		curData.reqError = true;
		curData.res.ip = req.host || '127.0.0.1';
		curData.res.statusCode = 502;
		curData.req.body = util.getErrorStack(err);
	}
	
	function update() {
		curData.res.ip = req.host || '127.0.0.1';
		curData.customHost = req.customHost;
		curData.realUrl = req.realUrl;
		curData.requestTime = curData.dnsTime = Date.now();
	}
	
	function handleResponse() {
		curData.res.statusCode = 200;
		curData.responseTime = curData.endTime = Date.now();
		req.removeListener('response', handleResponse);
		req.removeListener('error', handleError);
		req.removeListener('send', update);
	}
}

function handleRequest(req) {
	var startTime = Date.now();
	var id = startTime + '-' + ++count;
	var reqData = {
			method: req.method && req.method.toUpperCase() || 'GET', 
			httpVersion: req.httpVersion || '1.1',
            ip: req.ip || '::ffff:127.0.0.1',
            isWhistleHttps: req.isWhistleHttps,
            headers: req.headers
		};
	var resData = {
			ip: req.host
	};
	
	var curData = data[id] = {
			id: id,
			url: req.url,
			startTime: startTime,
			customHost: req.customHost,
			req: reqData,
			res: resData,
			rules: req.rules
	};
	
	ids.push(id);
	req.on('response', handleResponse);
	req.on('error', handleReqError);
	req.on('send', update);
	
	function update() {
		curData.dnsTime = (req.dnsTime || 0) + startTime;
		curData.customHost = req.customHost;
		resData.ip = req.host;
		if (req.realUrl && req.realUrl != req.url) {
			curData.realUrl = req.realUrl;
		}
	}
	
	function handleReqError(err) {
		update();
		if (reqData.body == null) {
			reqData.body = util.getErrorStack(err);
		}
		curData.endTime = curData.requestTime = Date.now();
		curData.reqError = true;
		rclearReqEvents();
		req._transform = passThrough;
	}
	
	var reqBody;
	var reqSize = 0;
	
	if (util.hasRequestBody(req)) {
		reqBody = false;
	}
	req._transform = function(chunk, encoding, callback) {
		
		if (chunk) {
			if (reqBody || reqBody === false) {
				reqBody = reqBody ? Buffer.concat([reqBody, chunk]) : chunk;
			}
			reqSize += chunk.length;
		}
		
		if (reqBody && reqBody.length > MAX_REQ_SIZE) {
			reqBody = null;
		}
		
		if (!chunk) {
			curData.requestTime = Date.now();
			curData.reqEnd = true;
			reqData.size = reqSize;
			reqData.body = decode(reqBody);
		}
		
		callback(null, chunk);
	};
	
	function clearReqEvents() {
		req.removeListener('response', handleResponse);
		req.removeListener('error', handleReqError);
		req.removeListener('send', update);
	}
	
	function handleResponse(res) {
		update();
		curData.responseTime = Date.now();
		resData.headers = res.headers;
		resData.statusCode = res.statusCode;
		res.on('error', handleResError);
		
		function clear() {
			res.removeListener('error', handleResError);
			clearReqEvents();
		}
		
		function handleResError(err) {
			resData.ip = req.host;
			resData.body = util.getErrorStack(err);
			curData.endTime = Date.now();
			curData.resError = true;
			res._transform = passThrough;
			clear();
		}
		
		var resBody;
		var resSize = 0;
		var contentType = util.getContentType(res.headers);
		if (contentType && contentType != 'IMG' && util.hasBody(res)) {
			resBody = false;
		}

		res._transform = function(chunk, encoding, callback) {
			if (chunk) {
				if (resBody || resBody === false) {
					resBody = resBody ? Buffer.concat([resBody, chunk]) : chunk;
				}
				
				resSize += chunk.length;
			}
			
			if (resBody && resBody.length > MAX_RES_SIZE) {
				resBody = null;
			}
			
			if (!chunk) {
				curData.endTime = Date.now();
				curData.resEnd = true;
				resData.size = resSize;
				clear();
				if (resBody) {
					var unzip;
					switch (util.toLowerCase(res.headers['content-encoding'])) {
					    case 'gzip':
					    	unzip = zlib.gunzip.bind(zlib);
					      break;
					    case 'deflate':
					    	unzip = zlib.inflate.bind(zlib);
					      break;
					}
					
					if (unzip) {
						var next = function(err, body) {
							resData.body = err ? util.getErrorStack(err) : decode(body);
							callback(null, chunk);
						};
						unzip(resBody, function(err, body) {
							if (err) {
								zlib.inflateRaw(resBody, next);
							} else {
								next(err, body);
							}
						});
						return;
					}
				}
				resData.body = decode(resBody);
			}
			
			callback(null, chunk);
		};
	}
	
}

function handleWebsocket(req) {
	var startTime = Date.now();
	var id = startTime + '-' + ++count;
	var reqData = {
			method: req.method && req.method.toUpperCase() || 'GET', 
			httpVersion: req.httpVersion || '1.1',
            ip: req.ip || '::ffff:127.0.0.1',
            headers: req.headers
		};
	var resData = {};
	var curData = data[id] = {
			id: id,
			url: req.url,
			customHost: req.customHost,
			startTime: startTime,
			dnsTime: startTime,
			req: reqData,
			res: resData,
			rules: req.rules
	};
	
	ids.push(id);
	req.on('response', handleResponse);
	req.on('error', handleError);
	req.on('send', update);
	
	function handleError(err) {
		update();
		resData.statusCode = 502;
		resData.headers = {};
		reqData.body = util.getErrorStack(err);
		curData.resEnd = true;
		curData.endTime = curData.requestTime = Date.now();
		req.removeListener('response', handleResponse);
	}
	function update() {
		curData.customHost = req.customHost;
		curData.dnsTime = (req.dnsTime || 0) + startTime;
		curData.rules = req.rules;
		resData.ip = req.host;
		if (req.realUrl && req.realUrl != req.url) {
			curData.realUrl = req.realUrl;
		}
	}
	
	function handleResponse(res) {
		update();
		curData.responseTime = Date.now();
		curData.endTime = curData.requestTime = Date.now();
		resData.headers = res.headers;
		resData.statusCode = res.statusCode;
		req.removeListener('response', handleResponse);
		req.removeListener('error', handleError);
		req.removeListener('send', update);
	}
}

module.exports = function init(_proxy) {
	proxy = _proxy;
	util = proxy.util;
	module.exports = get;
};