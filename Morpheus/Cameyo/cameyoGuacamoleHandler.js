function CameyoGuacamoleHandler()
{
	var guacamoleFrame = document.getElementById("application").contentWindow;
	
	// client scope object
	var ClientScope = null;
	
	this.Connect = function (){
		var frame = document.getElementById("application");
		//url example: 40.68.113.216:8080/#/client?appName=7-Zip&token=515b9290-66a9-4f7b-889a-9d2844c21be7
		frame.src = "";        
		frame.src = "/#/client?appName="+cameyoApp.GetAppNameParameter()+"&token="+cameyoApp.GetTokenParameter();  
	}

	this.Disconnect = function () {
		var scope = ClientScope;
		if(scope)
		{
			scope.$apply(function(){
				scope.disconnect();
			});	
		}
	}
	
	this.OverrideClient = function() {
		OverrideGuacamoleClient();
	}
	
	this.ShowApplication = function() {
		var cssLink = document.createElement("link") 
		cssLink.href = "cameyo_notifications.css"; 
		cssLink.rel = "stylesheet"; 
		cssLink.type = "text/css"; 
		guacamoleFrame.document.body.appendChild(cssLink);
	}
	
	this.ResizeWindow = function(statusBar){
		var display =  document.getElementById("display");
		display.style.height = window.innerHeight - statusBar.offsetHeight;
		display.style.width = window.innerWidth;
	}
	
	this.ShowKeyboardMenuItem = function(statusBar){
		var inputBtnImg = document.createElement('img');
		inputBtnImg.src = "images/input.png";
		inputBtnImg.id = "input_image";
		inputBtnImg.className = "tool_button_img";
	
		var inputBtnContainer = document.createElement('div');
		inputBtnContainer.id = "input_button_container";
		inputBtnContainer.className = "tool_button_container";
		inputBtnContainer.appendChild(inputBtnImg);
		
		var inputBtnLink = document.createElement('a');
		inputBtnLink.href = "#";
		inputBtnLink.onclick = showKeyboardSettings;
		inputBtnLink.id = "input_link";
		inputBtnLink.appendChild(inputBtnContainer);

		statusBar.appendChild(inputBtnLink);
	}
	
	this.Reconnect = function()	{
		var scope = ClientScope;
		if(scope)
		{
			var connStr = getCookie("connect_string", guacamoleFrame.document);
			scope.$apply(function(){				
				scope.client.client.connect(connStr);
				cameyoApp.SetHideErrors(false);
			});	
		}
		else
		{
			console.log("scope = null");
			this.Connect();
		}
	}
	
	// promises that client object is loaded
	function GetGuacamoleClient()
	{
		return new Promise(function(resolve, reject){
			getClientElement(resolve);
		});		
	}
	
	// gets guacamole client object
	function getClientElement(resolve)
	{
		var angular = guacamoleFrame.angular;
		
		if(angular)
		{
			element = angular.element(guacamoleFrame.document.getElementsByClassName("client-view")[0]);
			if(element && Object.keys(element).length > 0)
			{
				resolve(element);
				return;
			}
		}
		
		setTimeout(getClientElement.bind(this, resolve), 100);		
	}
	
	// overrides guacamole client functions and events
	function OverrideGuacamoleClient() {
		GetGuacamoleClient().then(function(elem){ 
			if(elem && Object.keys(elem).length > 0)
			{
				//get the injector.
				var injector = elem.injector();
	
				//get the guacamole notification service.
				var notificationService = injector.get('guacNotification');
	
				// override guacNotification.showStatus function (guacaNotification.js)
				notificationService.showStatus = function(status){
					if (cameyoApp.IsHideErrors())
						return;
					
					if(status)
					{
						console.log("Guac notification: " + JSON.stringify(status));
						if(status.className == "error")	{
							connectRetryCount = 4;
							reportError(kConnectionErrorTitle, kConnectionErrorMessage);
						}
					}
					else
					{
						// if status = false - hide all messages
						console.log("Guac notification: " + status);
						hideMessages();
					}
				};
				
				// hide the guacamole notifications
				notificationService.getStatus = function()
				{
					return false;
				}
	
				// gets the client scope object
				ClientScope = elem.scope();
				
				ClientStateChenge(ClientScope);
				
				//apply the changes to the scope.
				ClientScope.$apply();
			}
		});
	}
	
	// override hadler of guacamole client onstatechange event
	function ClientStateChenge(clientScope)
	{
		//var previousOnstatechange = clientScope.client.client.onstatechange;
		
		// handles the onstatechange event
		clientScope.client.client.onstatechange = cameyoApp.previousOnstatechange;
	}
	
	function showKeyboardSettings() { 
		// change menu title
		var menu = guacamoleFrame.document.getElementById("guac-menu");
		var header = menu.getElementsByClassName("menu-content")[0].getElementsByClassName("header")[0];
		for(var child = header.firstElementChild; child; child = child.nextElementSibling)
		{
			child.setAttribute("style", "display: none");
		}
		var newHeader = guacamoleFrame.document.createElement('h2');
		newHeader.innerHTML = "Cameyo HTML5";
		header.appendChild(newHeader);
		
		// show/hide guacamole keyboard settings
		var scope = ClientScope;
		if(scope)
		{
			scope.$apply(function(){
				scope.menu.shown = !scope.menu.shown;
				guacamoleFrame.focus();
			});
		}
		
		return false;
	}	
	
	function hideMessages()
	{
		var element = document.getElementsByClassName("dialogOuter")[0];
		if(element)
		{
			element.style.display = "table";
		}
	}
}