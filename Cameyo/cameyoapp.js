cameyoApp = new CameyoApp();

function CameyoApp()
{
	storageState =
	{
		StorageModeUnconfigured : 0,
		StorageModeOff : 1,
		StorageModeDesktop : 2,
		StorageModeAll : 3
	}
	var localThis = this;	

	kConnectionErrorTitle = "Connection Error";
	kConnectionErrorMessage = "An internal error has occurred within the server, and the connection has been terminated. Please restart application.";

	//config section
	var kUrlServerBase = "https://online.cameyo.com";
	var kUrlPackagerApi = kUrlServerBase + "/packager.aspx";
	var kUrlAppsBase = kUrlServerBase + "/apps";
	var kUrlStorageConfig = kUrlServerBase + "/linkStorage.aspx";
	var kUrlPlayShare = kUrlServerBase + "/playShare.aspx";
	var kUrlStorage = kUrlServerBase + "/storage";
	var kUrlAddServer = kUrlServerBase + "/playServers/add";
	var kUrlAddSoft = kUrlServerBase + "/add";
	var kUrlRegister = kUrlServerBase + "/register";
	
	var kDataStorageMenuText = "Data storage";
	var kMinWidthForMargin = 500;
	var kMinHeightForMargin = 500;
	this.kBarsHeight = 30; //total height of title and status bar plus 2px gap for some browsers
	this.kMargin = isMobile() || isSmallWindow() ? 0 : 0/*15*/; //margins for screen canvas
	var kAppNameParam = "appName";
	var kRdpStatusCheckInterval = 1500;//miliseconds
	var kTimerTimeout = 500;//miliseconds
	var kShowErrorTimeout = 180 * 1000;//miliseconds
	var hideErrors = false;
	var kConnectRetryTimeout = 15 * 1000;   // After 15 seconds of "Connecting..." cut the connection and try again
	var connectRetryCount = 0;
	var splashProgressDiv;
	var sessionInfo;
	var remainingTimeSec = 60 * 60;	// Just as initialization. The first sessionInfo + timer tick will set this correctly.
	var rdpStatus;

	var guacClientState = 0;
	var kGuacClientConnected = 3;
	var kGuacClientDisconnecting = 4;
	var kGuacClientDisconnected = 5;
	
	var kRdpTokenStatus_PkgBuilt = 7;
	var kRdpTokenStatus_ErrorMask = 0x10000000;
	
	var kComplete = 4;
	var kHTTPStatusOk = 200;
	
	// SessionFlags
	var sfAnonymous = 0x01;
	var sfDebug = 0x08;
	var sfPureRdp = 0x10;
	var sfCapture = 0x40;
	var sfDemoMode = 0x02000;
	
	var kChromeExtId = 'gkndpjfddnmddjomdmoencaljmceogek';
	var kChromeExtUrl = 'chrome-extension://' + kChromeExtId + '/';

	var dbgUI = false;
	
	var connHandler = null;
	var useChromeExt = !!window.chrome && !!window.chrome.webstore;
	
	// wsavail: 0 means no Websocket available on server -> Guacamole
	var wsavail = getParameterByName('wsavail');
	if (wsavail != null && wsavail == "0")
		useChromeExt = false;
	
	if(useChromeExt) {
		// Please, comment this and uncomment next line when the chrome extension would be loaded to the Chrome Web Store
		var url = kChromeExtUrl + 'index.html';
		var http = new XMLHttpRequest();
		http.open('HEAD', url, true);
		try
		{
			http.onreadystatechange = function() {
				if (http.readyState == 4) {
					if (http.status == 404 || http.status == 0)
						initFail();
					else
						initSuccess();
				}
			};
			http.send(null);
		}
		catch(err)
		{
			initFail();
		}
	}
	else {
		initConnection(false);
	}
	
	function initSuccess() {
		//InitExtensionFrame();
		
		window.addEventListener("message", function(event) {
			// We only accept messages from ourselves
			if (event.source != window)
				return;

			if (event.data.type && (event.data.type == "FROM_SCRIPT")) {
				var frame = document.getElementById("application");
				frame.src = "";        
				frame.src = event.data.text;
			}
		}, false);
		
		initConnection(true);
	}
	
	function InitExtensionFrame()
	{
		window.postMessage({ type: "FROM_PAGE", text: "Hello from the webpage!" }, "*");
		 
		var frame = document.getElementById("application");
		chrome.runtime.sendMessage(kChromeExtId, {}, function(response) {
			frame.src = "";        
			frame.src = response.url;
		});
	}

	function initFail() {
		initConnection(false);
	}
	
	function getParameterByName(name, url) {
		if (!url)
			url = window.location.href;
		name = name.replace(/[\[\]]/g, "\\$&");
		var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
			results = regex.exec(url);
		if (!results)
			return null;
		if (!results[2])
			return '';
		return decodeURIComponent(results[2].replace(/\+/g, " "));
	}
	
	function initConnection(isChromeExt){

		useChromeExt = isChromeExt;
		if (useChromeExt) {
			var pathname = window.location.pathname;
			if (pathname[0] == '/')
				pathname = pathname.substr(1, pathname.length-1);
			var url = kChromeExtUrl + pathname + window.location.search;
			console.log("Redirecting to ChromeExt: " + url);
			window.location.replace(url);
			console.log("Redirected");
			return;
		}

		var RdpConnHandler = useChromeExt ? CameyoExtHandler : CameyoGuacamoleHandler;
		connHandler = new RdpConnHandler();
	}
	
	// frame element for storing guacamole system
	var guacamoleFrame = document.getElementById("application").contentWindow; //CameyoGuacamoleHandler
	var displayedElement = guacamoleFrame;
	
	var menuLoginRequired = 1;
	var menuPkgIdRequired = 2;
	
	var kMenuItems = [];
	
	function getURLParameter(name)
	{
		return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null
	}
			
	//hide splash on debug	
	getSessionInfo().then(function(result){
		sessionInfo = result;
		if(sessionInfo != null)
		{
			console.log("Session flags: " + sessionInfo.sessionFlags);
			if (getURLParameter("dbg") == "1")
			{
				if((parseInt(sessionInfo.sessionFlags) & sfDebug) != 0)
				{
					hideSplashScreen();
				}
			}
			
			// show splash screen for hiding guacamole loading
			showSplashScreen();
			
			//menu items [title, href, onclick]
			kMenuItems = 
			[
				["Download app", "#", appDownloadLink, menuPkgIdRequired],
				["App page", "#", appInfoLink, menuPkgIdRequired],
				["Android client", "#", androidLink, 0],
				["<hr/>", "", null, 0],
				["Disconnect", "#", disconnect, 0]
			];
			
			
			showLoadIcon();
			if(!useChromeExt)
			{
				cameyoApp.start();
			}
			
			connHandler.OverrideClient();
		}
	});
	
	function reportError(title, status)
	{
		if (typeof readyTimer != "undefined"/* && (connectRetryCount > 3 || guacClientState === 3) */)
			clearInterval(readyTimer);
		if (typeof errorTimer != "undefined")
			clearTimeout(errorTimer);
		if (typeof connectRetryTimer != "undefined"/* && connectRetryCount > 3*/)
			clearTimeout(connectRetryTimer);
		hideLoadIcon();
		//hideSplashScreen();
		stopUsageTimer();
		console.log("reportError(" + title + ", " + status + ")");
		cameyoApp.showMessage(title, status); //GuacUI.Client.showStatus(title, status);   // Creates dialogOuter
		console.log("reportError: done");
	}
	
	/*GuacUI.Client.showError = function(title, status)
	{
		if (hideErrors)
			return;
		reportError(kConnectionErrorTitle, kConnectionErrorMessage);	// Transforming Guac's title + status for our own msg
	}*/
	
	function reportTimeoutError()
	{
		reportError("Disconnected", "Disconnected by timeout.");
	}
	
	function setStorageMode(storageMode)
	{
		console.log("setStorageMode");
		var image = document.getElementById("storage_image");
		var storageMenuContents = document.getElementById("storage_menu_contents");

		switch (storageMode)
		{
			case storageState.StorageModeUnconfigured:
				image.src = "images/storage-unconfigured.png"
				storageMenuContents.innerHTML  = "No storage connected.<br/>";
				storageMenuContents.innerHTML += "<a href='" + kUrlStorage + "' target='_blank'>Connect</a>";
				break;

				case storageState.StorageModeDesktop:
			case storageState.StorageModeAll:
				image.src = "images/storage-unconfigured.png"
				storageMenuContents.innerHTML = "<strong>Storage</strong><br/>Folder: Desktop\\Dropbox";
				break;

			default:
				break;
		}
	}

	function hideInfoMenus()
	{
		var storageMenu = document.getElementById("storage_menu_contents");
		var btnDiv = document.getElementById("storage_menu_button_container");
		storageMenu.style.display = "none";
		btnDown(btnDiv, false);

		menu = document.getElementById("server_menu_contents");
		btnDiv = document.getElementById("server_menu_button_container");
		menu.style.display = "none";
		btnDown(btnDiv, false);
	}

	function hideSystemMenu()
	{
		var systemMenu = document.getElementById("system_menu_contents");
		var btnDiv = document.getElementById("sysicon_button_container");
		systemMenu.style.display = "none";
		btnDown(btnDiv, false);
	}

	function appInfoLink()
	{
		hideSystemMenu();
		window.open(kUrlAppsBase + "/" + sessionInfo.pkgId);
	}

	function appDownloadLink()
	{
		hideSystemMenu();
		window.open(kUrlAppsBase + "/" + sessionInfo.pkgId + "/download");
	}
	
	function androidLink()
	{
		hideSystemMenu();
		window.open("https://play.google.com/store/apps/details?id=com.cameyo.player");
	}
	
	function shareLink()
	{
		hideSystemMenu();

		window.open(kUrlPlayShare + "?token=" + getURLParameter("token"));

		/*var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", kUrlPackagerApi + "?op=RdpShareLink&token="+getURLParameter("token"),false);
	
		try
		{
			xmlhttp.send();
	
			if (xmlhttp.readyState == kComplete 
				&& xmlhttp.status == kHTTPStatusOk)
			{
				console.log("shared link: " + xmlhttp.responseText);
				
				if (xmlhttp.responseText == "")
				{
					alert("Couldn't get the shared link.");
				}
			}
		}
		catch(e)
		{
			alert("Couldn't get the shared link.");
		}
		//window.prompt("Link for sharing. Ctrl + C to copy", xmlhttp.responseText);*/
	}
	
	function isSmallWindow()
	{
		if (window.innerWidth < kMinWidthForMargin || window.innerHeight < kMinHeightForMargin)
		{
			return true;
		}
		
		return false;
	}

	function isMobile()
	{
		return navigator.userAgent.match(/Android/i) != null
			|| navigator.userAgent.match(/BlackBerry/i) != null
			|| navigator.userAgent.match(/iPhone|iPad|iPod/i) != null
			|| navigator.userAgent.match(/Opera Mini/i) != null
			|| navigator.userAgent.match(/IEMobile/i) != null;
	}
	
	this.showMessage = function(title, message)
	{
		if(hideErrors)
			return;
		
		var element = document.getElementsByClassName("dialogOuter")[0];
		
		if(!element)
		{		
			// create dialog if not exists
			var outer  = document.createElement("div");
			outer.className = 'dialogOuter';
			document.getElementById("screen_canvas").appendChild(outer);
			
			var middle = document.createElement("div");
			middle.className = 'dialogMiddle';
			outer.appendChild(middle);
			
			var dialog = document.createElement("div");			
			dialog.className = 'dialog';
			middle.appendChild(dialog);
			
			var titleElem = document.createElement("p");
			titleElem.className = "title";
			dialog.appendChild(titleElem);
    
			var status = document.createElement("p");
			status.className = "status";
			dialog.appendChild(status);
			
			element = outer;
		}
		
		if (element)
		{
			var textElement = element.getElementsByClassName("status")[0];
			var titleElement = element.getElementsByClassName("title")[0];		
			
			if (!textElement)
			{
				var pText = document.createElement("p");
				pText.class = "status";
				pText.innerHTML = message;
	
				element.appendChild(pText);
			}
			else
			{
				textElement.innerHTML = message;
			}
		
			if (!titleElement)
			{
				var pTitle = document.createElement("p");
				pTitle.class = "title";
				pTitle.innerHTML = title;
	
				element.insertBefore(pTitle, element.firstChild);
			}
			else
			{
				titleElement.innerHTML = title;
			}
		
			element.style.display = "table";
			
			hideLoadIcon();
			showSplashScreen();
		}
	}

	function getOptimalHeight()
	{
		console.log("getOptimalHeight");
		var pixel_density = window.devicePixelRatio || 1;
		return ((window.innerHeight - localThis.kMargin * 2) * pixel_density) - 28;
	}	

	function resizeSplash()
	{
		/*var display = document.getElementById("display");
		display.style.height = getOptimalHeight() + "px";*/
	}
		
	function generateMenuItem(entry, parent)
	{
		if (entry == null)
		{
		    return;
		}
		var link = document.createElement('a');

		var isSeparator = (entry[0] == "<hr/>");
		if (isSeparator)
		{
			link.style.padding = "0";
			link.style.color = "#424242";
		}

		link.innerHTML = entry[0];
	
		if(entry[1] != null)
		{
			link.href = entry[1];
		}
	
		if(entry[2] != null)
		{
			link.onclick = entry[2];
		}
	
		var li = document.createElement('li');
		if (isSeparator)
		{
			li.style.padding = "0";
			li.style.height = "5px";
		}
		li.appendChild(link);
		
		parent.appendChild(li);
	}

	// shows guacamole frame after loading
    function showApplication()
    {
		var frame = document.getElementById("application");
		frame.style.display = "block";	
		
		connHandler.ShowApplication();
				
		displayedElement.focus();
    }
	
	function startRenderingRemote()
	{       
		console.log("startRenderingRemote");
		if (typeof readyTimer != "undefined")
			clearInterval(readyTimer);		
		if (typeof connectRetryTimer != "undefined")
			clearTimeout(connectRetryTimer);
		clearTimeout(errorTimer);
		
		hideLoadIcon();
		hideSplashScreen();

		showApplication();

		getSessionInfo().then(function(result){
			sessionInfo = result;
			addBars(sessionInfo);
			initSessionInfo(sessionInfo);

			//status timer start
			initDate = new Date();
			halfSecTimer(sessionInfo);
		});	
	}

	var startedConnecting = false;

	var kProvisioning = 2;
	var kReadyForConnection = 3;
	var kApplicationReady = 4;
	var kErrorCapacity = 8;

	function onRdpStatus(rdpStatus)
	{
		console.log("onRdpStatus");

		if (rdpStatus == kErrorCapacity) {
			cameyoApp.showMessage("Over capacity", "Please try again in a few minutes."); //GuacUI.Client.showError("Over capacity", "Please try again in a few minutes.");
			disconnect();
			hideLoadIcon();
			alert("We're overwhelmed due to increasing demand. Please try again in a few minutes.");
			return;
		}
		if ((rdpStatus & kRdpTokenStatus_ErrorMask) != 0) {
			getSessionInfo().then(function(result){
				sessionInfo = result;
				disconnect();
				reportError("Error", sessionInfo.errStr);
				hideLoadIcon();
			});
			return;
		}

		
		var isRdp = (parseInt(sessionInfo.sessionFlags) & sfPureRdp) != 0;
		if (!startedConnecting && rdpStatus >= kReadyForConnection)
		{
			console.log("Starting connection");
			if (rdpStatus >= kApplicationReady)	// Shouldn't happen; looks like a page refresh (F5) on an already-finished/in-progress session
			{
				if (!isRdp)	// Exclude PureRDP sessions from this protection mechanism
				{
					console.log("Page refresh? Disconnecting.");
					cameyoApp.showMessage("Page refresh", "Please restart the app through Play button, not through refresh.");
					disconnect();
					hideLoadIcon();
					return;
				}
			}

			clearTimeout(errorTimer);
			errorTimer = setTimeout(reportTimeoutError, kShowErrorTimeout);

			startedConnecting = true;
			if (!dbgUI) {
                connectGuacamoleClient();			//guacGlobalClient.connect(guacGlobalConnectStr);	
				if (typeof connectRetryTimer != "undefined")
					clearTimeout(connectRetryTimer);
				connectRetryTimer = setTimeout(connectRetry, kConnectRetryTimeout);
			}

			var infoMessage = document.getElementById("info_div");
			infoMessage.innerHTML = "Connecting...";
		}

		if (rdpStatus >= kApplicationReady)
		{
			console.log("Cameyo RAP ready for display");
			splashProgressDiv.style.display = "none";
			if (guacClientState == kGuacClientConnected || isRdp || dbgUI)
			{
				console.log("GClient ready too.");
				startRenderingRemote();
			}
			else
				console.log("GClient not yet ready.");
		}
		else if (rdpStatus == kProvisioning)
		{
			console.log("Still provisioning app...");
		}
	}

	// reload iframe
    function connectGuacamoleClient()
    {
		connHandler.Connect();
    }

	function isAppReady()
	{
		console.log("isAppReady");
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", kUrlPackagerApi + "?op=RdpStatus&token="+getURLParameter("token"),true);
		xmlhttp.onload = function(e){
			if (xmlhttp.readyState == kComplete && xmlhttp.status == kHTTPStatusOk)
			{
				console.log("Server status: " + xmlhttp.responseText);
				rdpStatus = parseInt(xmlhttp.responseText);
				onRdpStatus(rdpStatus);
			}
		}
		xmlhttp.onerror = function(e){
			if(connectRetryCount > 3)
			{
				disconnect();
				reportError("Error", "Unspecified error");
			}
		}
		xmlhttp.send();
	}
	
	function connectRetry()
	{
		connectRetryCount++;
		console.log("connectRetry #" + connectRetryCount);
		if (connectRetryCount <= 3) {
			var infoMessage = document.getElementById("info_div");
			infoMessage.innerHTML = "Connecting (" + connectRetryCount + ")...";
			
			//var previousOnstatechange = guacGlobalClient.onstatechange;
			hideErrors = true;   // Avoid intermediate "Connection error" messages
			
			if(guacClientState >= 3)
			{
				disconnect();      //guacGlobalClient.disconnect();
			}
			ClientConnect();   //guacGlobalClient.connect(guacGlobalConnectStr);
			
			hideErrors = false;
			
			if (typeof connectRetryTimer != "undefined")
				clearTimeout(connectRetryTimer);
			connectRetryTimer = setTimeout(connectRetry, kConnectRetryTimeout);
		}
		else
		{
			hideErrors = false;
			cameyoApp.showMessage("Disconnected", "Disconnected by timeout");
		}
	}
	
	// connect to the client
	function ClientConnect()
	{
		console.log("ClientConnect");
		
		startedConnecting = true;
		
		connHandler.Reconnect();
	}
	
	function showSplashScreen()
	{
		console.log("showSplashScreen");
		var target = document.getElementById("splash_screen");
		
		if (target)
		{
			var info = document.getElementById("info_div");
			if(info)
			{
				info.innerText = "";
			}
			target.style.display = "table";
		}
	}
	
	function hideSplashScreen()
	{
		console.log("hideSplashScreen");
		var target = document.getElementById("splash_screen");
		
		if (target)
		{
			target.style.display = "none";
		}
	}
	
	function hideLoadIcon()
	{
		var spinner = document.getElementsByClassName("spinner")[0];

		if (spinner)
		{
			spinner.style.display = "none";
		}
	
	}
	
	function showLoadIcon()
	{
		var display = document.getElementById("display");
		var splashDiv = document.createElement('div');

		//spinner begin
		var spinner = document.createElement('div');
		spinner.className = "spinner";
		
		/*var preloaderImage = document.createElement('img');
		preloaderImage.className = "animated-preloader";
		preloaderImage.src = "images/loading.png";
		spinner.appendChild(preloaderImage);*/

		// new preloader animation: two opposite circles, vertically centered
		var preloaderBig = document.createElement('div');
		preloaderBig.className = "anim-big-circle";
		var preloaderSmall = document.createElement('div');
		preloaderSmall.className = "anim-small-circle";
		spinner.appendChild(preloaderBig);
		spinner.appendChild(preloaderSmall);

		var infoDiv = document.createElement('div');
		infoDiv.id = "info_div";

		//infoDiv.style.top = getOptimalHeight()/2 + 20 + "px";
		infoDiv.innerHTML = "Provisioning...";

		spinner.appendChild(infoDiv);
		
		splashDiv.appendChild(spinner);
		//spinner end

		var width = display.offsetWidth - 2 * localThis.kMargin;

		splashDiv.setAttribute("style", "width: " + width + "px");

		splashProgressDiv = document.createElement('div');

		splashDiv.id = "splash_screen";
		splashProgressDiv.id = "splash_progress";
		display.insertBefore(splashDiv, display.firstChild);
		display.insertBefore(splashProgressDiv, display.firstChild);
	
		splashProgressDiv.style.width = splashDiv.style.width;
	}
	
	function resetScale()
	{
		//guacGlobalClient.scale(1);
	}
	
	function disconnect()
	{
		stopUsageTimer();
		localThis.exitFullscreen();
		//guacGlobalClient.disconnect();
		connHandler.Disconnect();
	}
	
	function reconnect()
	{
		console.log("call reconnect");
		var scope = ClientScope;
		if(scope)
		{
			console.log("call reconnect - scope != null");
			scope.$apply(function(){
				scope.reconnect();
				OverrideGuacamoleClient();
			});	
		}
	}
	
	function updateTitle()
	{
		var titleText = getURLParameter(kAppNameParam);
		if (titleText)
		{
			document.title = titleText;
		}
	}
        
	this.start = function()
	{
        updateTitle()
		resizeSplash();
              
		errorTimer = setTimeout(reportTimeoutError, kShowErrorTimeout);

		var sseSupport = (window.EventSource !== undefined);
		var isChrome = !!window.chrome;
		if (sseSupport && !isChrome)
		{
			var source = new EventSource(kUrlPackagerApi + "?op=RdpStatusSSE&token=" + getURLParameter("token"));
			source.onmessage = function(event) {
				console.log("isAppReadySSE: " + event.data);
				rdpStatus = parseInt(event.data);
				onRdpStatus(rdpStatus);
				if (rdpStatus >= kApplicationReady) {
					console.log("Closing SSE");
					source.close();		// We're done here
				}
			};
		}
		else {
			console.log("No SSE support");
			readyTimer = setInterval(isAppReady, kRdpStatusCheckInterval);
		}

		//var previousOnresize = guacamoleFrame.onresize;
	
		window.onresize = function()
		{
			//CameyoExtHandler.ResizeWindow();
			resetScale();
			ResizeStatusBar();
			
			var statusBar = document.getElementById("status_bar");
			var frame = document.getElementById("application");
			var body = document.getElementsByTagName("body")[0];
			
			connHandler.ResizeWindow(statusBar);
			
			var screen =  document.getElementById("screen_canvas");
			screen.style.height = window.innerHeight;
			screen.style.width = window.innerWidth;
			
			var pixelDensity = window.devicePixelRatio || 1;
			//frame.style.width = window.innerWidth  * pixelDensity;
			frame.style.height = window.innerHeight  * pixelDensity - statusBar.offsetHeight;
			
			
			
			
			/*
			display = guacamoleFrame.document.getElementsByClassName("display")[0];
			main = guacamoleFrame.document.getElementsByClassName("main")[0];
			
			if(ClientScope.client.client && display)
			{
				var pixelDensity = window.devicePixelRatio || 1;
				var width  = main.offsetWidth  * pixelDensity;
				var height = main.offsetHeight * pixelDensity;

				if (display.offsetWidth !== width || display.offsetHeight !== height)
					ClientScope.client.client.sendSize(width, height);
			}*/
		};
	}
		
	function handleMessage(message) {
		alert("handleMessage");
		var typeName = message.data.toString();
		if (typeName == '[object ArrayBuffer]') {
			handleDump(message.data);
			return;
		}

		var prefix = "json:";
		if (message.data.substr(0, prefix.length) === prefix) {
			var jsonObject = JSON.parse(message.data.substr(prefix.length));
			switch (jsonObject.message_type) {
			case "command": handleCommand(jsonObject);
				break;
			case "status": handleStatus(jsonObject);
				break;
			default:
				console.log("invalid json format");
				return;
			}

			return;
		}

		console.log("NACL MSG: " + message.data);
	}

	this.previousOnstatechange = function(state){

			//previousOnstatechange(state);
	
			resetScale();

			console.log("state" + state);

			guacClientState = state;
			
			if(state === kGuacClientConnected)
			{
				console.log("connected");
				
				if (typeof connectRetryTimer != "undefined")
					clearTimeout(connectRetryTimer);
				
				if (rdpStatus >= kApplicationReady)	// Special case where rdpStatus is already at kApplicationReady when guac connects (yes... I've seen it happen)
					onRdpStatus(rdpStatus);
				
				//was here: readyTimer = setInterval(isAppReady, kRdpStatusCheckInterval);
				//startRenderingRemote(); //was elsewhere
			}
			else if(state === kGuacClientDisconnecting) //disconnecting
			{
				stopUsageTimer();
			}
			else if(state === kGuacClientDisconnected) //disconnected
			{
				stopUsageTimer();
				if ((parseInt(sessionInfo.sessionFlags) & sfDemoMode) !== 0)
				{
					cameyoApp.showMessage("Want more?", 
						"<a target='_blank' href='" + kUrlRegister + "' style='color:yellow'>Register</a> your FREE account to:<br/>" + 
						"<br/>" + 
						"- Add your own software -<br/>" + 
						"- Increase session time -<br/>" + 
						"- Connect your own storage &amp; files -<br/>" + 
						"- Host your own server for faster access -<br/>" + 
						"- Use our faster native players -<br/>");
						//"Please take our <a target='_blank' href='" + "https://cameyo.typeform.com/to/XbdjBY" + "' style='color:yellow'>quick survey</a> and help us improve.<br/>");
				}
				else
					cameyoApp.showMessage("Session over", 
						"You have been disconnected.<br/>");
						//"Please take our <a target='_blank' href='" + "https://cameyo.typeform.com/to/XbdjBY" + "' style='color:yellow'>quick survey</a> and help us improve.<br/>");
			}
		}
	
	this.exitFullscreen = function()
	{
		var button = document.getElementById("fullscreen_link");
	
		if (button)
		{
			button.onclick = localThis.goFullscreen;
		}	
		
		if (document.exitFullscreen)
		{
			document.exitFullscreen();
		} 
		else if (document.msExitFullscreen)
		{
			document.msExitFullscreen();
		} 
		else if (document.mozCancelFullScreen)
		{
			document.mozCancelFullScreen();
		} 
		else if (document.webkitExitFullscreen)
		{
			document.webkitExitFullscreen();
		}
				
		displayedElement.focus();
	}
	
	this.goFullscreen = function()
	{
		var button = document.getElementById("fullscreen_link");
		button.onclick = localThis.exitFullscreen;
		
		//var elem = document.getElementById("screen_canvas");
                var elem = document.getElementsByTagName("body")[0];
	
		if (elem.requestFullscreen)
		{
			elem.requestFullscreen();
		} 
		else if (elem.msRequestFullscreen)
		{
			elem.msRequestFullscreen();
		}
		else if (elem.mozRequestFullScreen)
		{
			elem.mozRequestFullScreen();
		}
		else if (elem.webkitRequestFullscreen)
		{
			elem.webkitRequestFullscreen();
		}
				
		displayedElement.focus();
	}
	
	function btnDown(btn, isDown)
	{
		if (isDown)
			btn.className += " button_down";
		else
			btn.className = btn.className.replace(" button_down", "");
		
		displayedElement.focus();
	}
	
	this.handleSysMenu = function()
	{
		hideInfoMenus();

		var menu = document.getElementById("system_menu_contents");
		btn = document.getElementById("sysicon_button_container");
	
		if(menu.style.display == "none")
		{
			menu.style.display = "block";
			btnDown(btn, true);
		}
		else
		{
			menu.style.display = "none";
			btnDown(btn, false);
		}
	}

	/*this.setStorage = function(param)
	{
		setStorageMode(param);
	}*/
	
	/*this.handleStorageMenu = function()
	{
		hideSystemMenu();

		var menu = document.getElementById("storage_menu_contents");
		var btn = document.getElementById("storage_menu_button_container");
	
		if(menu.style.display == "none")
		{
			menu.style.display = "block";
			btnDown(btn, true);
		}
		else
		{
			menu.style.display = "none";
			btnDown(btn, false);
		}
	}*/
	
	function formatTime(i)
	{
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}

	function popFromTop(id, msg) {
		var existElem = document.getElementById(id);
		if(!existElem)
		{
			console.log("popFromTop: " + id);
			var popFromTopDiv = document.createElement('div');
			popFromTopDiv.id = id;
			popFromTopDiv.innerHTML = msg;

			var popFromTopClose = document.createElement('a');
			popFromTopClose.id = "popfromtop-close";
			popFromTopClose.href = "#";
			popFromTopClose.onclick = function()
			{
				var elem = document.getElementById("popfromtop-close");
				elem.parentElement.style.display = "none"; 
				document.getElementById("application").focus(); 
			};
			popFromTopClose.innerHTML = "[close]";
			popFromTopDiv.appendChild(popFromTopClose);

			var main = document.getElementById("screen_canvas");
			main.appendChild(popFromTopDiv);
		}
	}

	var blinker = 0;
	var halfSecCount = 0;
	var lastPkgId = "";
	function halfSecTimer()
	{
		var now = new Date();
	
		var elapsed = (now - initDate) / 1000;	// In seconds
		var timeField = document.getElementById("timer_field");
		//console.log("sessionInfo.sessionFlags=" + sessionInfo.sessionFlags + ", elapsed=" + elapsed);

		halfSecCount++;
		if (halfSecCount % 2 == 0)
			remainingTimeSec--;

		if (remainingTimeSec <= 0)
		{
			disconnect();
			return;
		}
		if (remainingTimeSec < 10 * 60)		// Show this only when there's less than 10 minutes remaining
		{
			var hh = Math.floor(remainingTimeSec / 3600);
			var mm = Math.floor(remainingTimeSec / 60) % 60;
			var ss = Math.floor(remainingTimeSec) % 60;

			// Add leading zeros
			mm = formatTime(mm);
			ss = formatTime(ss);
			hh = formatTime(hh);
			
			timeField.innerHTML = hh + ":" + mm + ":" + String(ss).substring(0,2);
			//timeField.innerHTML = "Remaining: " +  + "s";
			if (remainingTimeSec <= 30)
			{
				if (blinker == 1)
					timeField.style.color = "White";
				else
					timeField.style.color = "Red";
			}
		}
		/*else
		{
			var hh = Math.floor(elapsed / 3600);
			var mm = Math.floor((elapsed % 3600) / 60);
			var ss = (elapsed % 3600) % 60;

			//add a zero in front of numbers<10
			mm = formatTime(mm);
			ss = formatTime(ss);
			hh = formatTime(hh);

			timeField.innerHTML = hh + ":" + mm + ":" + String(ss).substring(0,2);
		}*/
		if (Math.floor(elapsed) == 6) {
			if ((parseInt(sessionInfo.sessionFlags) & sfDemoMode) != 0) {	// Anonymous user playing a public package
				if (isAnonymousSession())
					popFromTop('popfromtop', "<a href='" + kUrlRegister + "' target='_blank'>Register</a> your free account to increase session time.");
				else if (sessionInfo.storageMode == storageState.StorageModeUnconfigured || sessionInfo.storageMode == storageState.StorageModeOff)
					popFromTop('popfromtop', "<a href='" + kUrlStorage + "' target='_blank'>Connect</a> your Dropbox / Google Drive to directly open/save your files.");
			}
		}
				
		// In Capture mode, check for built package every 5 seconds
		if ((parseInt(sessionInfo.sessionFlags) & sfCapture) != 0 && halfSecCount % 10 == 0) {
			getSessionInfo().then(function(result) {
				sessionInfo = result;
				if (sessionInfo.status == kRdpTokenStatus_PkgBuilt && sessionInfo.pkgId != lastPkgId) {
					lastPkgId = sessionInfo.pkgId;
					popFromTop('iframepop', "<iframe src='" + kUrlAppsBase + "/" + sessionInfo.pkgId + "?state=ready&amp;display=iframe'></iframe>");
				}
				if ((sessionInfo.status & kRdpTokenStatus_ErrorMask) != 0) {
					reportError('Error', sessionInfo.errStr);
					disconnect();
					return;   // Stop this timer
				}
				
				blinker ^= 1;
				stopUsageTimer();
				usageTimer = setTimeout(halfSecTimer, kTimerTimeout);
			});
		}
		else
		{
			blinker ^= 1;
			stopUsageTimer();
			usageTimer = setTimeout(halfSecTimer, kTimerTimeout);
		}
	}
	
	function stopUsageTimer()
	{
		if (typeof usageTimer != "undefined")
		{
			clearTimeout(usageTimer);
		}
	}
	
	function isAnonymousSession()
	{
		if (sessionInfo == null || sessionInfo.sessionFlags == "")
			return true;	// Shouldn't happen
		return ((parseInt(sessionInfo.sessionFlags) & sfAnonymous) != 0)
	}

	function getSessionInfo()
	{
		console.log("getSessionInfo");
		return new Promise(function(resolve, reject) {
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open("GET", kUrlPackagerApi + "?op=RdpInfo&token="+getURLParameter("token"),true);
			
			xmlhttp.onload = function(e){
				if (xmlhttp.readyState == kComplete 
					&& xmlhttp.status == kHTTPStatusOk)
				{
					console.log("getSessionInfo - success");
					console.log("Server status: " + xmlhttp.responseText);
					var sessionInfo = JSON.parse(xmlhttp.responseText);
					remainingTimeSec = parseInt(sessionInfo.remainingTimeSec);
					resolve(sessionInfo);
					//return sessionInfo;
				}
			};
			
			xmlhttp.onerror = function(e){
				console.log("getSessionInfo - error");
				reject(null);
			};
			
			xmlhttp.send();
		});	
	}

	function initSessionInfo(sessionInfo)
	{	
		//if (sessionInfo == null || sessionInfo.storageProviderName == "")
		//{
		//	setStorageMode(0);
		//	return;
		//}
		//setStorageMode(parseInt(sessionInfo.storageMode));
		//var providerLogo = document.getElementById("storage_menu_button_container"/*provider_logo*/);
		//providerLogo.src = sessionInfo.storageProviderImg;

		console.log("initSessionInfo");
		
		// Storage info
		var storageMenuContents = document.getElementById("storage_menu_contents");
		var image = document.getElementById("storage_image");
		if (sessionInfo.storageMode == storageState.StorageModeAll || 
			sessionInfo.storageMode == storageState.StorageModeDesktop)
		{
			image.src = "images/storage-unconfigured.png"
			storageMenuContents.innerHTML  = "<strong>Storage: on</strong>" + "<br/><hr/>";
			storageMenuContents.innerHTML += sessionInfo.storageProviderName + "<br/>";
			storageMenuContents.innerHTML += "<a href='" + kUrlStorage + "' target='_blank'>Settings</a>";
		}
		else
		{
			image.src = "images/storage-unconfigured.png"
			storageMenuContents.innerHTML  = "<strong>Storage: off</strong>" + "<br/><hr/>";
			storageMenuContents.innerHTML += "<a href='" + kUrlStorage + "' target='_blank'>Connect</a>";
		}

		// Server info
		var serverMenuContents = document.getElementById("server_menu_contents");
		publicStr = (sessionInfo.serverPublic == 0 ? "Private" : "Public");
		serverMenuContents.innerHTML  = "<strong>Server: " + publicStr + "</strong><br/><hr/>" + sessionInfo.serverHostName + "<br/>" + sessionInfo.serverLocationName + "<br/>";
		serverMenuContents.innerHTML += "<a href='" + kUrlAddServer + "' target='_blank'>Host your own server</a>";
	}
	
	function addInfoMenu(statusBar, name, tooltip, imgSrc)
	{
		var infoImageContainer = document.createElement('div');
		infoImageContainer.id = name + "_image_container";

		var infoImage = document.createElement('img');
		infoImage.id = name + "_image";
		infoImage.src = imgSrc;

		//infoImageContainer.appendChild(infoImage);

		var infoMenuBtn = document.createElement('a');
		//infoMenuBtn.href = "#";
		infoMenuBtn.id = name + "_menu_link";
		infoMenuBtn.onclick = function() { 
			var menu = document.getElementById(name + "_menu_contents");
			var btn = document.getElementById(name + "_menu_button_container");
			if(menu.style.display == "none")
			{
				hideSystemMenu();
				hideInfoMenus();
				menu.style.display = "block";
				btnDown(btn, true);
			}
			else
			{
				menu.style.display = "none";
				btnDown(btn, false);
			}
			return false; 
		};

		// info button image
		var infoMenuButtonContainer = document.createElement('div');
		infoMenuButtonContainer.id = name + "_menu_button_container";
		infoMenuButtonContainer.className = "info_menu_button_container";
		infoMenuButtonContainer.appendChild(infoImage);
		infoMenuButtonContainer.title = tooltip;

		infoMenuBtn.appendChild(infoMenuButtonContainer);

		var infoMenu = document.createElement('div');
		infoMenu.id = name + "_menu";
		infoMenu.className = "info_menu";

		var infoImage = document.createElement('img');
		var infoLink = document.createElement('a');

		/*var headerDiv = document.createElement("li");
		headerDiv.id = name + "_menu_header";

		// info provider title text
		var providerSpan = document.createElement("span");
		providerSpan.id = name + "_provider_name";
		providerSpan.innerHTML = "";
		headerDiv.appendChild(providerSpan);*/

		//
		// info menu
		
		// info menu HTML contents
		var infoMenuContents = document.createElement('div');
		infoMenuContents.id = name + "_menu_contents";
		infoMenuContents.className = "info_menu_contents";
		infoMenuContents.innerHTML = "";
		infoMenuContents.style.display = "none";
		
		// info info bar
		var infoMenuInfo = document.createElement('span');
		infoMenuInfo.id = name + "_menu_info";
		//infoMenuInfo.className = "info_menu_info";
		infoMenuInfo.innerHTML = "";
		infoMenuContents.appendChild(infoMenuInfo);
		
		infoMenu.appendChild(infoMenuContents);
		
		statusBar.appendChild(infoMenu);
		statusBar.appendChild(infoMenuBtn);
	}

	function addBars(sessionInfo)
	{
		var display = document.getElementById("display");
		console.log("display.width=" + display.className + ": " + display.offsetWidth + " " + display.width);
		/*var screen = display.getElementsByClassName("software-cursor")[0];
		if (dbgUI)
			screen.style.height = "400px";
		console.log("statusBar.width=" + screen.className + ": " + screen.offsetWidth + " " + screen.width);*/

		// Status bar
		//var statusBar = document.createElement('div');
		//statusBar.className = "status_bar";
	
        var statusBar = document.getElementById("status_bar");
        
		// Gear btn
		var sysicon = document.createElement('img');
		sysicon.src = "images/gear.png";
		sysicon.id = "system_icon";
	
		var sysiconDiv = document.createElement('div');
		sysiconDiv.id = "sysicon_button_container";
	
		var sysiconLink = document.createElement('a');
		sysiconLink.href = "#";
		sysiconLink.appendChild(sysiconDiv);
	
		statusBar.appendChild(sysiconLink);
	
		sysiconLink.addEventListener("click", localThis.handleSysMenu, false);

		// System menu
		var systemMenu = document.createElement('div');
		systemMenu.id = "system_menu";

		var ul = document.createElement('ul');
		ul.id = "system_menu_contents";
		ul.style.display = "none";
	
		systemMenu.appendChild(ul);
	
		var anonymous = isAnonymousSession();
		for(var i = 0; i < kMenuItems.length; i++)
		{
			if ((kMenuItems[i][3] & menuLoginRequired) && anonymous)
				continue;
			if (kMenuItems[i][3] & menuPkgIdRequired)
			{
				if (sessionInfo.pkgId == null || sessionInfo.pkgId == "")
					continue;
			}
			generateMenuItem(kMenuItems[i], ul);
		}
	
		sysiconDiv.appendChild(systemMenu);
		sysiconDiv.appendChild(sysicon);

		// Separator
		var menuSeparator = document.createElement('div');
		menuSeparator.className = "menu_separator";
		statusBar.appendChild(menuSeparator); 

		// Storage menu
		addInfoMenu(statusBar, "storage", "Storage", "images/storage-unconfigured.png");

		// Separator
		menuSeparator = document.createElement('div');
		menuSeparator.className = "menu_separator";
		statusBar.appendChild(menuSeparator); 

		// Server menu
		addInfoMenu(statusBar, "server", "Server", "images/server.png");
		
		// Full-screen btn
		var fullscreenBtnImg = document.createElement('img');
		fullscreenBtnImg.src = "images/fullscreen.png";
		fullscreenBtnImg.id = "fullscreen_button";
		fullscreenBtnImg.className = "tool_button_img";
	
		var fullscreenContainer = document.createElement('div');
		fullscreenContainer.id = "full_screen_button_container";
		fullscreenContainer.className = "tool_button_container";
		fullscreenContainer.appendChild(fullscreenBtnImg);

		var fullscreenLink = document.createElement('a');
		fullscreenLink.href = "#";
		fullscreenLink.onclick = localThis.goFullscreen;
		fullscreenLink.id = "fullscreen_link";
		fullscreenLink.appendChild(fullscreenContainer);
	
		statusBar.appendChild(fullscreenLink);

		// Input btn
		connHandler.ShowKeyboardMenuItem(statusBar)
		
		// Product logo	
		if (getURLParameter("disp") == "1")
		{
			var logo = document.createElement('img');
			logo.src = "images/logo.png";
			logo.id = "custom_logo";
			statusBar.appendChild(logo);
		}

		// Timer
		var timer = document.createElement('span');
		timer.id = "timer_field";
		statusBar.appendChild(timer);

		// Add status bar
		ResizeStatusBar();

		console.log("addBars: done");
	}
	
	function ResizeStatusBar()
	{
		var statusBar = document.getElementById("status_bar");
		
		// Add status bar
		var bodyElem = document.body;
		var width = bodyElem.offsetWidth - 2 * localThis.kMargin; //eyo: was: screen.offsetWidth;
		var displayVal = "block";
		if (sessionInfo != null && sessionInfo.uiToolbar != null && sessionInfo.uiToolbar != "1")
			displayVal = "none";
		statusBar.setAttribute("style", "width:" + width + "px; display:" + displayVal);
	}
	
	this.ConnectedStatus = function()
	{
		cameyoApp.previousOnstatechange(kGuacClientConnected);
	}
	
	
	this.DisconnectedStatus = function()
	{
		cameyoApp.previousOnstatechange(kGuacClientDisconnected);
	}
	
	this.GetAuthRequestUrl = function()
	{
		return kUrlPackagerApi + "?op=RdpAuth&client=Play.NaCL&token="+cameyoApp.GetTokenParameter();		
	}
	
	this.GetAppNameParameter = function()
	{
		return getURLParameter("appName");
	}
	
	this.GetTokenParameter = function()
	{
		return getURLParameter("token");
	}
	
	this.IsHideErrors = function()
	{
		return hideErrors;
	}
	
	this.SetHideErrors = function(val){
		hideErrors = val;
	}
}