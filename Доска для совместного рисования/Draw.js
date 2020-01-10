

var orbiter;
var msgManager;
var UPC = net.user1.orbiter.UPC;
var roomID = "idz.room";
var Attributes = {THICKNESS:"thickness", 
                  COLOR:"color"};
var Messages = {MOVE:"MOVE", 
                PATH:"PATH"};

var isPenDown = false;
var defaultLineColor = "#000000";
var defaultLineThickness = 1;
var maxLineThickness = 30;
var localPen = {};
var localLineColor = defaultLineColor;
var localLineThickness = defaultLineThickness;
var bufferedPath = [];
var lastBufferTime = new Date().getTime();

var userCurrentPositions = {};
var userCommands = {};
var userColors = {};
var userThicknesses = {};

var canvas;
var context;
var DrawingCommands = {LINE_TO:       "lineTo",
                       MOVE_TO:       "moveTo",
                       SET_THICKNESS: "setThickness",
                       SET_COLOR:     "setColor"};

var broadcastPathIntervalID;
var processDrawingCommandsIntervalID;

var hasTouch = false;

window.onload = init;

function init () {
  initCanvas();
  registerInputListeners();
  initOrbiter();
  
  setStatus("Connecting to Server...");
}


function initCanvas () {
	
  canvas = document.getElementById("canvas");
  
  canvas.width  = 600;
  canvas.height = 400;
  
  context = canvas.getContext('2d');
  context.lineCap = "round";
  
  document.getElementById("thickness").selectedIndex = 0;
  document.getElementById("color").selectedIndex = 1;
}

function registerInputListeners () {
  canvas.onmousedown = pointerDownListener;
  document.onmousemove = pointerMoveListener;
  document.onmouseup = pointerUpListener;
  document.ontouchstart = touchDownListener;
  document.ontouchmove = touchMoveListener;
  document.ontouchend = touchUpListener;
  document.getElementById("thickness").onchange = thicknessSelectListener;
  document.getElementById("color").onchange = colorSelectListener;
}

function initOrbiter () {

  orbiter = new net.user1.orbiter.Orbiter();

  if (!orbiter.getSystem().isJavaScriptCompatible()) {
    setStatus("Your browser is not supported.")
    return;
  }
  
  orbiter.addEventListener(net.user1.orbiter.OrbiterEvent.READY, readyListener, this);
  orbiter.addEventListener(net.user1.orbiter.OrbiterEvent.CLOSE, closeListener, this);

  msgManager = orbiter.getMessageManager();
  
  orbiter.connect("tryunion.com", 80);
}

function readyListener (e) {
  msgManager.addMessageListener(UPC.JOINED_ROOM, joinedRoomListener, this);
  msgManager.addMessageListener(UPC.ROOM_OCCUPANTCOUNT_UPDATE, 
                                roomOccupantCountUpdateListener, this);  
  msgManager.addMessageListener(UPC.ROOM_SNAPSHOT, roomSnapshotListener, this);
  msgManager.addMessageListener(UPC.CLIENT_ATTR_UPDATE, clientAttributeUpdateListener, this);
  msgManager.addMessageListener(UPC.CLIENT_REMOVED_FROM_ROOM, clientRemovedFromRoomListener, this);
  
  msgManager.addMessageListener(Messages.MOVE, moveMessageListener, this, [roomID]);
  msgManager.addMessageListener(Messages.PATH, pathMessageListener, this, [roomID]);
    
  msgManager.sendUPC(UPC.CREATE_ROOM, roomID);
  msgManager.sendUPC(UPC.JOIN_ROOM, roomID);
}

function closeListener (e) {
  setStatus("Disconnected from Server.");
  clearInterval(processDrawingCommandsIntervalID);
}

function joinedRoomListener (roomID) {
  processDrawingCommandsIntervalID = setInterval(processDrawingCommands, 20);
}

function roomOccupantCountUpdateListener (roomID, numOccupants) {
  numOccupants = parseInt(numOccupants);
  if (numOccupants == 1) {
    setStatus("Now drawing on your own (no one else is here at the moment)");
  } else if (numOccupants == 2) {
    setStatus("Now drawing with " + (numOccupants-1) + " other person");
  } else {
    setStatus("Now drawing with " + (numOccupants-1) + " other people");
  }
}

function roomSnapshotListener (requestID,
                               roomID,
                               occupantCount,
                               observerCount,
                               roomAttributes) {

  var clientList = Array.prototype.slice.call(arguments).slice(5);
  var clientID;
  var roomAttrString;
  var roomAttrs;
  var attrName;
  var attrVal;
  
  for (var i = 0; i < clientList.length; i+=5) {
    clientID = clientList[i];
  
    clientAttrString = clientList[i+4];
    clientAttrs = clientAttrString == "" ? [] : clientAttrString.split("|");
    
    for (var j = 0; j < clientAttrs.length; j++) {
      attrName = clientAttrs[j];
      attrVal  = clientAttrs[j+1];
      processClientAttributeUpdate(clientID, attrName, attrVal);
    }
  }
}

function clientAttributeUpdateListener (attrScope, 
                                        clientID,
                                        userID,
                                        attrName,
                                        attrVal,
                                        attrOptions) { 
  if (attrScope == roomID) {
    processClientAttributeUpdate(clientID, attrName, attrVal);
  }
}

function clientRemovedFromRoomListener (roomID, clientID) {
  delete userThicknesses[clientID];
  delete userColors[clientID];
  delete userCommands[clientID];
  delete userCurrentPositions[clientID];
}

function processClientAttributeUpdate (clientID, attrName, attrVal) {
  if (attrName == Attributes.THICKNESS) {
    addDrawingCommand(clientID, DrawingCommands.SET_THICKNESS, getValidThickness(attrVal));
  } else if (attrName == Attributes.COLOR) {
    addDrawingCommand(clientID, DrawingCommands.SET_COLOR, attrVal);
  }
}

function moveMessageListener (fromClientID, coordsString) {
  var coords = coordsString.split(",");
  var position = {x:parseInt(coords[0]), y:parseInt(coords[1])};
  addDrawingCommand(fromClientID, DrawingCommands.MOVE_TO, position);
}


function pathMessageListener (fromClientID, pathString) {
  var path = pathString.split(",");
  

  var position;
  for (var i = 0; i < path.length; i+=2) {
    position = {x:parseInt(path[i]), y:parseInt(path[i+1])};
    addDrawingCommand(fromClientID, DrawingCommands.LINE_TO, position);
  }
}

function broadcastPath () {
  
  if (bufferedPath.length == 0) {
    return;
  }
  msgManager.sendUPC(UPC.SEND_MESSAGE_TO_ROOMS, 
                     Messages.PATH, 
                     roomID, 
                     "false", 
                     "", 
                     bufferedPath.join(","));
  bufferedPath = [];
  if (!isPenDown) {
    clearInterval(broadcastPathIntervalID);
  }
}


function broadcastMove (x, y) {
  msgManager.sendUPC(UPC.SEND_MESSAGE_TO_ROOMS, 
                     Messages.MOVE, 
                     roomID, 
                     "false", 
                     "", 
                     x + "," + y);
}

function addDrawingCommand (clientID, commandName, arg) {
  if (userCommands[clientID] == undefined) {
    userCommands[clientID] = [];
  }
  var command = {};
  command["commandName"] = commandName;
  command["arg"] = arg;
  userCommands[clientID].push(command);
}

function processDrawingCommands () {
  var command;
  for (var clientID in userCommands) {
    if (userCommands[clientID].length == 0) {
      continue;
    }
    
    command = userCommands[clientID].shift();
    switch (command.commandName) {
      case DrawingCommands.MOVE_TO:
        userCurrentPositions[clientID] = {x:command.arg.x, y:command.arg.y};
        break;
        
      case DrawingCommands.LINE_TO:
        if (userCurrentPositions[clientID] == undefined) {
          userCurrentPositions[clientID] = {x:command.arg.x, y:command.arg.y};
        } else {
          drawLine(userColors[clientID] || defaultLineColor, 
                   userThicknesses[clientID] || defaultLineThickness, 
                   userCurrentPositions[clientID].x, 
                   userCurrentPositions[clientID].y,
                   command.arg.x, 
                   command.arg.y);
           userCurrentPositions[clientID].x = command.arg.x; 
           userCurrentPositions[clientID].y = command.arg.y; 
        }
        break;
        
      case DrawingCommands.SET_THICKNESS:
        userThicknesses[clientID] = command.arg;
        break;
        
      case DrawingCommands.SET_COLOR:
        userColors[clientID] = command.arg;
        break;
    }
  }
}

function touchDownListener (e) {
  hasTouch = true;
  if (event.target.nodeName != "SELECT") {
    e.preventDefault();
  }
  var touchX = e.changedTouches[0].clientX - canvas.offsetLeft;
  var touchY = e.changedTouches[0].clientY - canvas.offsetTop;
  if (!isPenDown) {
    penDown(touchX, touchY);
  }
}

function touchMoveListener (e) {
  hasTouch = true;
  e.preventDefault();
  var touchX = e.changedTouches[0].clientX - canvas.offsetLeft;
  var touchY = e.changedTouches[0].clientY - canvas.offsetTop;
  penMove(touchX, touchY);
}

function touchUpListener () {
  penUp();
}

function pointerDownListener (e) {

  if (hasTouch) {
    return;
  }
  
  var event = e || window.event; 
  var mouseX = event.clientX - canvas.offsetLeft;
  var mouseY = event.clientY - canvas.offsetTop;
  
  penDown(mouseX, mouseY);
  
  if (event.preventDefault) {
    if (event.target.nodeName != "SELECT") {
      event.preventDefault();
    }
  } else {
    return false; 
  }
}

function pointerMoveListener (e) {
  if (hasTouch) {
    return;
  }
  var event = e || window.event;
  var mouseX = event.clientX - canvas.offsetLeft;
  var mouseY = event.clientY - canvas.offsetTop;
  
  penMove(mouseX, mouseY);

  if (event.preventDefault) {
    event.preventDefault();
  } else {
    return false; 
  }
}

function pointerUpListener (e) {
  if (hasTouch) {
    return;
  }
  penUp();
}

function thicknessSelectListener (e) {
  var newThickness = this.options[this.selectedIndex].value;
  localLineThickness = getValidThickness(newThickness);
  msgManager.sendUPC(UPC.SET_CLIENT_ATTR, 
                     orbiter.getClientID(),
                     "",
                     Attributes.THICKNESS,
                     newThickness,
                     roomID,
                     "4");
}

function colorSelectListener (e) {
  var newColor = this.options[this.selectedIndex].value;
  localLineColor = newColor;

  msgManager.sendUPC(UPC.SET_CLIENT_ATTR, 
                     orbiter.getClientID(),
                     "",
                     Attributes.COLOR,
                     newColor,
                     roomID,
                     "4");

}

function penDown (x, y) {
  isPenDown = true;
  localPen.x = x;
  localPen.y = y;
  
  broadcastMove(x, y);
  
  broadcastPathIntervalID = setInterval(broadcastPath, 500);
}

function penMove (x, y) { 
  if (isPenDown) {
    if ((new Date().getTime() - lastBufferTime) > 10) {
      bufferedPath.push(x + "," + y);
      lastBufferTime = new Date().getTime();
    }
    
    drawLine(localLineColor, localLineThickness, localPen.x, localPen.y, x, y);
    
    localPen.x = x;
    localPen.y = y;
  }
}

function penUp () {
  isPenDown = false;
}

function drawLine (color, thickness, x1, y1, x2, y2) {
  context.strokeStyle = color;
  context.lineWidth   = thickness;
  
  context.beginPath();
  context.moveTo(x1, y1)
  context.lineTo(x2, y2);
  context.stroke();
}

function setStatus (message) {
  document.getElementById("status").innerHTML = message;
}

function getValidThickness (value) {
  value = parseInt(value);
  var thickness = isNaN(value) ? defaultLineThickness : value;
  return Math.max(1, Math.min(thickness, maxLineThickness));
}


















