
Hooks.on("renderSidebarTab", async (app, html) => {
  if (app.options.id == "scenes")
  {
    let button = $("<button class='import-dd'><i class='fas fa-file-import'></i> DungeonDraft Import</button>")
    let settings = game.settings.get("dd-import", "importSettings")
    let path = settings.path;
    let offset = settings.offset
    let wallLength = settings.wallLength
    let wallAmount = settings.wallAmount
    let fidelity = settings.fidelity
    button.click(function() {
      new Dialog({
        title : "DungeonDraft Import",
        content : 
        `<div>
        <nav class="sheet-navigation tabs" data-group="primary">
          <a class="item active" data-tab="import">Import</a>
          <a class="item" data-tab="advanced">Advanced</a>
        </nav>
        <div data-tab="import" class="tab" data-group="primary">
         <div class="form-group import"><div class="import-options">Scene Name</div><input type = 'text' name = "sceneName"/></div>
         <div class="form-group import"><div class="import-options">Path</div><input type = 'text' name = "path" value="${path}"/></div>
         <div class="form-group import"><div class="import-options" title = "Fidelity decides how many cave walls to skip - Right is high fidelity, no walls skipped">Fidelity</div><input type="range" min="1" max="6" value= "3" name="fidelity"></div>
         <div class="form-group import"><div class="import-options">Upload</div><input class="file-picker" type = 'file' accept = ".dd2vtt"/></div>
        <div data-tab="advanced" class="tab" data-group="primary">
        <div class="form-group import"><div class="import-options" title = "Offset to the wall in the file, from -3 to +3  in 1/10th grid">Offset</div><input type="number" min="-3" step="0.1" max="3" value= "{offset}" name="offset"></div>
        <div class="form-group import"><div class="import-options" title = "Length of cave walls">Threshhold for cave wall length</div><input type="number" min="0" step="0.05" value= "0.25" name="wallLengthThreshold"></div>
        <div class="form-group import"><div class="import-options" title = "Length of cave walls">Threshhold for cave wall length</div><input type="number" min="0" max="100" step="5" value= "60" name="wallAmountThreshold"></div>
        </div>
        </div>
        `,
        buttons :{
          import : {
            label : "Import",
            callback : async (html) => {
              let file = JSON.parse(await html.find(".file-picker")[0].files[0].text())
              let fileName = html.find(".file-picker")[0].files[0].name.split(".")[0];
              let sceneName = html.find('[name="sceneName"]').val()
              let fidelity = html.find('[name="fidelity"]').val()
              let offset = html.find('[name="offset"]').val()/10.0
              let wallLength = html.find('[name="wallLengthThreshold"]').val()
              let wallAmount = html.find('[name="wallAmountThreshold"]').val()
              let path = html.find('[name="path"]').val()
              await DDImporter.uploadFile(file, fileName, path)
              DDImporter.DDImport(file, sceneName, fileName, path, fidelity, offset, wallLength, wallAmount)
              game.settings.set("dd-import", "importPath", path);
              game.settings.set("dd-import", "offset", offset);
              game.settings.set("dd-import", "wallLength", wallLength);
              game.settings.set("dd-import", "wallAmount", wallAmount);
              game.settings.set("dd-import", "fidelity", fidelity);
            }
          },
          cancel: {
            label : "Cancel"
          }
        },
        default: "import"
      }).render(true);
    })
    html.find(".directory-footer").append(button);
  }
})

    let offset = game.settings.get("dd-import", "offset");
    let wallLength = game.settings.get("dd-import", "wallLength");
    let wallAmount = game.settings.get("dd-import", "wallAmount");
    let fidelity = game.settings.get("dd-import", "fidelity");

Hooks.on("init", () => {
  game.settings.register("dd-import", "importSettings", {
    name : "DungeonDraft Default Path",
    scope: "world",
    config: "false",
    default: {
      path:"worlds/" + game.world.name,
      offset: 0.1,
      wallLength: 0.25,
      wallAmount: 75,
      fidelity: 3,
    }
  })
})



class DDImporter {

  static async uploadFile(file, name, path)
  {
    var byteString = atob(file.image);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);

    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    let uploadFile = new File([ab], name + ".png", { type: 'image/png'});
    await FilePicker.upload("data", path, uploadFile, {})
  }

  static async DDImport(file, sceneName, fileName, path, fidelity, offset, wallLength, wallAmount)
  {

    let newScene = await Scene.create({
     img : path + "/" + fileName + ".png",
     name : sceneName,
     grid: file.resolution.pixels_per_grid, 
     width : file.resolution.pixels_per_grid * file.resolution.map_size.x, 
     height : file.resolution.pixels_per_grid * file.resolution.map_size.y
    })
    let walls = this.GetWalls(file, newScene, 6-fidelity, offset, wallLength, wallAmount)
    let doors = this.GetDoors(file, newScene, offset)
    let lights = this.GetLights(file, newScene);
    newScene.update({walls: walls.concat(doors), lights : lights})
  }

  static GetWalls(file, scene, skipNum, offset, wallLength, wallAmount)
  {
    let walls = [];
    let ddWalls = file.line_of_sight
    ddWalls = this.preprocessWalls(ddWalls, skipNum)

    for (let wsIndex = 0; wsIndex < ddWalls.length; wsIndex++)
    {
      let wallSet = ddWalls[wsIndex]
      // Find walls that directly end on this walls endpoints. So we can close walls, after applying offets
      let connectTo = []
      let connectedTo = []
      for (let i = 0; i < ddWalls.length; i++){
        if (i == wsIndex) continue
        if (wallSet[wallSet.length - 1].x == ddWalls[i][0].x && wallSet[wallSet.length - 1].y == ddWalls[i][0].y){
          connectTo.push(ddWalls[i][0])
        }
        if (wallSet[0].x == ddWalls[i][ddWalls[i].length - 1].x && wallSet[0].y == ddWalls[i][ddWalls[i].length - 1].y){
          connectedTo.push(wallSet[0])
        }
      }
      if (offset != 0){
        wallSet = this.makeOffsetWalls(wallSet, offset, wallLength, wallAmount)
      }
      // Connect to walls that end *before* the current wall
      for (let i = 0; i < connectedTo.length; i++)
      {
        walls.push(this.makeWall(file, scene, connectedTo[i], wallSet[0]))
      }
      for (let i = 0; i < wallSet.length-1; i++)
      {
        walls.push(this.makeWall(file, scene, wallSet[i], wallSet[i+1]))
      }
      // Connect to walls that end *after* the current wall
      for (let i = 0; i < connectTo.length; i++)
      {
        walls.push(this.makeWall(file, scene, wallSet[wallSet.length - 1], connectTo[i]))
      }
    }

    return walls
  }

  static makeWall(file, scene, pointA, pointB){
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    return new Wall({
      c : [
        (pointA.x * file.resolution.pixels_per_grid) + offsetX,
        (pointA.y * file.resolution.pixels_per_grid) + offsetY,
        (pointB.x * file.resolution.pixels_per_grid) + offsetX,
        (pointB.y * file.resolution.pixels_per_grid) + offsetY
      ]
    }).data
  }

  static preprocessWalls(walls, numToSkip)
  {
    for (let wallSet of walls)
    {
      let toRemove = [];
      let skipCounter = 0;
      for (let i = 0; i < wallSet.length-2; i++)
      {
        if (i != 0 && i != wallSet.length-2 && this.distance(wallSet[i], wallSet[i+1]) < 0.3)
        {
          if (skipCounter == numToSkip)
          {
            skipCounter = 0;
          }
          else 
          {
            skipCounter++;
            toRemove.push(i);
          }
        }
        else 
          skipCounter = 0;
      }
      if (toRemove.length)
      {
        for (let i = toRemove.length-1; i > 0; i--)
        {
          wallSet.splice(toRemove[i], 1)
        }
      }
    }
    return walls
  }

  static makeOffsetWalls(wallSet, offset, shortWallThreshold = 0.25, shortWallAmountThreshold = 0.6){
    let wallinfo = [];
    let shortWalls = this.GetShortWallCount(wallSet, shortWallThreshold);
    // Assume short wallsets or containing long walls are not caves.
    let shortWallAmount = Math.round((shortWalls/wallSet.length)*100);
    if (wallSet.length < 10 || shortWallAmount < shortWallAmountThreshold){
      console.debug(`seems not to be a cave: ${wallSet.length} walls and ${shortWallAmount}% short Walls`);
      return wallSet
    }
      console.debug(`seems to be a CAVE: ${wallSet.length} walls and ${shortWallAmount}% short Walls`);
    // connect the ends if they match
    if (wallSet[0].x == wallSet[wallSet.length-1].x && wallSet[0].y == wallSet[wallSet.length-1].y){
      wallSet.push(wallSet[1]);
      wallSet.push(wallSet[2]);
    }
    for (let i = 0; i < wallSet.length-1; i++)
    {
      let slope;
      let myoffset;
      let woffset;
      let m;
      if ((wallSet[i+1].x - wallSet[i].x) == 0){
        slope = undefined;
        myoffset = offset;
        if (wallSet[i+1].y < wallSet[i].y){
          myoffset = -myoffset;
        }
        woffset = {x: myoffset, y: 0}
        m = 0;
      }else{
        slope = ((wallSet[i+1].y - wallSet[i].y)/(wallSet[i+1].x - wallSet[i].x))
        let dir = (wallSet[i+1].x - wallSet[i].x)>=0;
        woffset = this.GetOffset(slope, offset, dir);
        m = wallSet[i].x + woffset.x - wallSet[i].y + woffset.y
      }
      let x = wallSet[i].x + woffset.x
      let y = wallSet[i].y + woffset.y
      wallinfo.push({
        x: x,
        y: y,
        slope: slope,
        m: m
      })
    }
    let newWallSet = []
    for (let i = 0; i < wallSet.length-2; i++)
    {
      newWallSet.push(this.interception(wallinfo[i], wallinfo[i+1]));
    }
    return newWallSet
  }

  static GetShortWallCount(wallSet, shortWallThreshold){
    let shortCount = 0;
    for (let i = 0; i < wallSet.length-1; i++){
      if (this.distance(wallSet[i], wallSet[i+1]) < shortWallThreshold){
        shortCount++;
      }
    }
    return shortCount
  }

  static GetOffset(slope, offset, dir){
    let yoffset = Math.sqrt((offset*offset)/(1+slope*slope));
    let xoffset = slope * yoffset;
    if ((slope <= 0 && dir) || (slope > 0 && dir)){
      return {x : xoffset, y : -yoffset}
    }
    return {x : -xoffset, y : yoffset}
  }

  static interception(wallinfo1, wallinfo2){
    /*
     * x = (m2-m1)/(k1-k2)
     * y = k1*x + m1
     */
    if (wallinfo1.slope == undefined){
      let m2 = wallinfo2.y - wallinfo2.slope*wallinfo2.x
      return {x: wallinfo1.x, y: wallinfo2.slope * wallinfo1.x + m2}
    }
    if (wallinfo2.slope == undefined){
      let m1 = wallinfo1.y - wallinfo1.slope*wallinfo1.x
      return {x: wallinfo2.x, y: wallinfo1.slope * wallinfo2.x + m1}
    }
    let m1 = wallinfo1.y - wallinfo1.slope*wallinfo1.x
    let m2 = wallinfo2.y - wallinfo2.slope*wallinfo2.x
    let x = (m2 - m1)/(wallinfo1.slope - wallinfo2.slope)
    return {x: x, y: wallinfo1.slope * x + m1}
  }

  static distance(p1, p2)
  {
    return Math.sqrt(Math.pow((p1.x - p2.x), 2) + Math.pow((p1.y - p2.y), 2))
  }

  static GetDoors(file, scene, offset)
  {
    let doors = [];
    let ddDoors = file.portals;
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;

    if (offset != 0){
      ddDoors = this.makeOffsetWalls(ddDoors, offset)
    }
    for (let door of ddDoors)
    {
      doors.push(new Wall({
          c : [
            (door.bounds[0].x   * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[0].y   * file.resolution.pixels_per_grid) + offsetY,
            (door.bounds[1].x * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[1].y * file.resolution.pixels_per_grid) + offsetY
          ],
          door: true
        }).data)
    }

    return doors
  }

  static GetLights(file, scene)
  {
    let lights = [];
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    for (let light of file.lights)
    {
        let newLight = new AmbientLight({
          t: "l",
          x: (light.position.x * file.resolution.pixels_per_grid)+offsetX,
          y: (light.position.y * file.resolution.pixels_per_grid)+offsetY,
          rotation: 0,
          dim: light.range*4,
          bright: light.range*2,
          angle: 360,
          tintColor: "#" + light.color.substring(2),
          tintAlpha: (0.2 * light.intensity)
        })
        lights.push(newLight.data);
    }
    return lights;
    } 
}
