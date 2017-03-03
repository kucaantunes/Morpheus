var InitSize = {
	width: 0,
	height: 0,
	scale: 1.0
}

var rdpFrame = null;//window.frames.application;

window.addEventListener("message", handleMessageFromExt)

function handleMessageFromExt(message)
{
	var typeName = message.data.toString();
    if (typeName == '[object ArrayBuffer]') {
        handleDump(message.data);
        return;
    }
	
	try
	{
		var jsonObject = JSON.parse(message.data);
		switch (jsonObject.message_type) {
			case "command":
				switch(jsonObject.action)
				{
					case "connected":
						cameyoApp.ConnectedStatus();
						break;
					case "disconnected":
						cameyoApp.DisconnectedStatus();
						break;
					case "initialized":
						rdpFrame = window.frames.application;
						cameyoApp.start();
						break;
				}
				break;
			case "message":
				cameyoApp.showMessage(jsonObject.error_type, !jsonObject.error_message || jsonObject.error_message.length == 0 ? JSON.stringify(jsonObject) : jsonObject.error_message );
				break;
		}
	}
	catch(e)
	{
		console.log(e);
	}
}

function CameyoExtHandler()
{
	//var reconnect = 0;
	
	//var rdpFrame = window.frames.application;//document.getElementById("application");//.contentWindow;
	
	/*this.initWidth = 0;
	this.initHeight = 0;
	this.initScale = 1.0;
	this.currentScale = 1.0;
	*/
	this.Connect = function (){
		var XHR = window.XDomainRequest || window.XMLHttpRequest;
		var xmlhttp = new XHR();
		
		var authLink = cameyoApp.GetAuthRequestUrl();
		xmlhttp.open("GET", authLink, true);
		
		xmlhttp.onload = function(e){
			if (xmlhttp.readyState == 4 && xmlhttp.status == 200)
			{
				AuthRequestLoaded(xmlhttp.responseText);
			}
		}
		
		xmlhttp.onerror = function(e){
			console.log("auth - error");
			reject(null);
		};
		
		xmlhttp.send();
	}
	
	this.Disconnect = function () {
		var json = {
			message_type:"command",
			command: "disconnect"
		}
		
		if(rdpFrame)
			rdpFrame.postMessage("json:"+JSON.stringify(json),"*");
	}
	
	this.OverrideClient = function() { }
	
	this.ShowApplication = function() { }
	
	this.ResizeWindow = function(statusBar) { 
		//var display =  rdpFrame.document.getElementById("listener");
		var currentHeight = window.innerHeight - statusBar.offsetHeight;
		var currentWidth = window.innerWidth;
		//display.style.height = currentHeight;
		//display.style.width = currentWidth;
		
		var heightScale = currentHeight / InitSize.height;
		var widthScale = currentWidth / InitSize.width;
		
		var currentScale = Math.min(heightScale, widthScale);
		
		var json = {
			message_type:"command",
			command: "set_scale",
			scale: currentScale
		}
		
		if(rdpFrame)
			rdpFrame.postMessage("json:"+JSON.stringify(json),"*");
		
		//rdpFrame.set_scale(currentScale);
	}
	
	this.ShowKeyboardMenuItem = function(statusBar){}
	
	this.Reconnect = function()	{
		if(!rdpFrame)
		{
			InitExtension();
		}
		else
		{
			this.Disconnect();
			this.Connect();
		}
	}
	
	function AuthRequestLoaded(data){		
		console.log(JSON.stringify(data));
		var res = JSON.parse(data);
		
		var statusBar = document.getElementById("status_bar");
		
		InitSize.width = window.innerWidth;
		InitSize.height = window.innerHeight - statusBar.offsetHeight;
		InitSize.scale = 1.0;
		
		var json = {
			message_type:"command",
			command: "connect",
			params: {
				v: res.parameters.hostname,
				port: res.parameters.websocket_port,
				w: InitSize.width,
				h: InitSize.height,
				scale_factor: InitSize.scale,
				u: res.parameters.username,
				p: res.parameters.password,
			}
		};
		console.log("Json: " + JSON.stringify(json));
		if(rdpFrame) rdpFrame.postMessage("json:"+JSON.stringify(json),"*");
	}
	/*
	function GetNaclModule(){
		return new Promise(function getModule(resolve, reject) {
			
			if(rdpFrame.common.naclModule)
			{
				resolve(rdpFrame.common.naclModule);
				return;
			}
			
			setTimeout(getModule.bind(this, resolve), 100);
		});
	}	*/
}