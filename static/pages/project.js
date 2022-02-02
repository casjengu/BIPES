"use strict"

import {Tool, API} from '../base/tool.js'
import {DOM, Animate, ContextMenu} from '../base/dom.js'
import {command} from '../base/command.js'
import {storage} from '../base/storage.js'
import {navigation} from '../base/navigation.js'

import {notification} from './notification.js'

class Project {
  constructor (){
    this.name = 'project'
    this.currentUID = undefined
    this.projects = {}
    this.inited = false

    this.cors_token = storage.has('cors_token') ?
                      storage.fetch('cors_token') :
                      storage.set('cors_token', Tool.UID().substring(0,12))
    
    this.username = storage.has('username') ?
                    storage.fetch('username') :
                    storage.set('username', 'a user')

    let $ = this._dom = {}

    $.projects = new DOM('span', {className:'listy'})

    $.h2 = new DOM('h2', {innerText:"Projects"})
    $.wrapper = new DOM('span', {className: "projects"})
      .append([
        new DOM('div', {id:'user-projects'})
        .append([
          new DOM('div', {className:'header'})
            .append([
              new DOM('h3', {innerText:'Your projects'}),
              new DOM('span').append([
                DOM.prototypeInputFile({
                  id:'upload',
                  className:'icon',
                  innerText: "Upload"
                }).onevent('change', this, this.upload),
                new DOM('button', {
                  id:'add',
                  className:'icon text',
                  innerText: "New"
                }).onclick(this, this.new)
              ])
            ]),
          $.projects
        ])
    ])

    $.container = new DOM('div', {className:'container'})
      .append([$.h2, $.wrapper])

    $.contextMenu = new DOM('div')
    this.contextMenu = new ContextMenu($.contextMenu, this)

    $.section = new DOM(DOM.get('section#project'))
      .append([$.container, $.contextMenu])
    $.section._dom.classList.add('default')

    // Cross tabs event handler on connecting and disconnecting device
    command.add(this, {
      new: this._new,
      remove: this._remove,
      update: this._update
    })

    let keys = storage.keys(/project-(.*)/)
    keys.forEach((key) => {
      let proj = storage.fetch(`project-${key}`)
      try {
       this.projects[key] = JSON.parse(proj)
      } catch (e) {
        console.error(e)
      }
    })
    
    if (Object.keys(this.projects).length == 0)
      this.new()
    
    // Init shared projects if server mode
    if (!navigation.isLocal)
      this.shared = new SharedProject(this, $.wrapper)
  }
  _init (){
    // Get most recent project
    let uid = this._mostRecent()

    this.select(uid)
  }
  save (uid){
    if (uid == undefined)
      uid = this.currentUID
    this.projects[uid].lastEdited = +new Date()
    let json = JSON.stringify(this.projects[uid])

    storage.set(`project-${uid}`, json)
  }
  /*
   * Create a new project in the platform. If an existing project is provided,
   * will be imported with a new uid, if not, a new empty project.
   * Then dispatches changes.
   * (:js:func:`_emptyProject`) is created.
   * @param {string} ev - On click event.
   * @param {Object/string} obj - Existing project, as parsed object or string.
   */
  new (ev, obj){
    let uid = Tool.UID(),
        project = obj == undefined ? this._emptyProject() :
                  obj instanceof Object ? obj : JSON.parse(obj)

    command.dispatch(this, 'new', [uid, project])
    // Update localStorage once
    storage.set(`project-${uid}`, JSON.stringify(project))

    return uid
  }
  /*
   * Include the new project, called by the dispatch of :js:func:`new`.
   * @param {string} uid - Project's uid.
   * @param {Object} project - The project.
   */
  _new (uid, project){
    this.projects[uid] = project

    if (!this.inited)
      return

    this._dom.projects._dom.insertBefore(
      this._domCard(uid, this.projects[uid])._dom,
      this._dom.projects._dom.firstChild
    )
  }
  remove (uid){
    // Create project if no project will be left
    if (Object.keys(this.projects).length == 1)
      this.select(this.new())

    // Unshare if shared
    let shared = this.projects[uid].project.shared
    if (shared.hasOwnProperty('uid') && shared.uid !== '')
      this.unshare(uid)

    command.dispatch(this, 'remove', [uid])
    // Update localStorage once
    storage.remove(`project-${uid}`)


    this.contextMenu.close()
  }
  _remove (uid){
    delete this.projects[uid]

    if (!this.inited)
      return

    // Must find child to work between tabs
    let child = DOM.get(`[data-uid=${uid}]`, this._dom.projects._dom)
    this._dom.projects._dom.removeChild(child)

    if (uid == this.currentUID) {
      this.currentUID = undefined
      if ((Object.keys(this.projects).length > 0)){
        this.select(this._mostRecent())
      }
    }
  }
  load (uid){
    this.currentUID = uid

    for (const key in window.bipes.page) {
      if (typeof window.bipes.page[key].load == 'function' && this.projects.hasOwnProperty(uid) && key != 'project')
        window.bipes.page[key].load(this.projects[uid][key])
    }
    return uid
  }
  unload (uid){

  }
  set (obj, uid){
    if (uid == undefined)
      uid = this.currentUID
    for (const key in obj){
      this.projects[uid][key] = obj[key]
    }
  }
  _emptyProject (){
    return {
      device: {
        target:'esp32'
      },
      blocks: {
        xml:'<xml xmlns="https://bipes.net.br/ide"></xml>'
      },
      files:{
        tree:{
          name:'',
          files:[{
            name:'script.py',
            script:"# Create your script here"
          }]
        }
      },
      project:{
        name: 'Empty project',
        author: this.username,
        shared:{
          uid:'',
          token:''
        },
        createdAt: +new Date(),
        lastEdited: +new Date()
      }
    }
  }
  init (){
    if (this.inited)
      return

    let project = []
    for (const key in this.projects) {
      project.unshift(this._domCard(key, this.projects[key]))
    }
    this._dom.projects.append(project)

    // Only on a slave tab
    if (this.currentUID != undefined) {
      let child = DOM.get(`[data-uid=${this.currentUID}]`, this._dom.projects._dom)
      child.classList.add('on')
      DOM.get('#name', child).disabled = false
    }
    if (this.hasOwnProperty('shared'))
      this.shared.init()    

    this.inited = true
  }
  select (uid){
    if (uid == this.currentUID || !this.projects.hasOwnProperty(uid))
      return

    if (this.currentUID != undefined){
      this.unload(uid)
      if (this.inited) {
        let old_uid = this.currentUID
        let child = DOM.get(`[data-uid=${old_uid}]`, this._dom.projects._dom)
        child.classList.remove('on')
        DOM.get('#name', child).disabled = true
      }
    }
    this.load(uid)

    if (this.inited){
      let child2 = DOM.get(`[data-uid=${this.currentUID}]`, this._dom.projects._dom)
      child2.classList.add('on')
      DOM.get('#name', child2).disabled = false
    }
  }
  deinit (){
    if(!this.inited)
      return

    if (this.hasOwnProperty('shared'))
      this.shared.deinit()
  }
  /*
   * Creates a DOM project card
   */
  _domCard (uid, item){
    let _shared_class = item.project.shared.uid != '' ? 'shared' : ''

    return new DOM('button', {className:_shared_class, uid: uid})
      .append([
        new DOM('div', {className:'row'}).append([
          new DOM('h4', {
            id:'name',
            innerText: item.project.name
          }),
          new DOM('div', {
            id:'sharedUID',
            innerText:item.project.shared.uid
          })
        ]),
        new DOM('div', {className:'row'}).append([
          new DOM('div', {
            id:'lastEdited',
            innerText:Tool.prettyEditedAt(item.project.lastEdited)
          })
        ])
     ])
     .onclick(this, this.select, [uid])
     .onevent('contextmenu', this, (ev) => {
       ev.preventDefault()
       let actions = [
         {
           id:'rename',
           innerText:'Rename',
           fun:this.rename,
           args:[uid, item.project.name]
         },
         {
           id:'download',
           innerText:'Download',
           fun:this.download,
           args:[uid]
         },
         {
           id:'remove',
           innerText:'Delete',
           fun:this.remove,
           args:[uid]
         }
       ]
       if (!navigation.isLocal) {
         if (item.project.shared.hasOwnProperty('uid') && item.project.shared.uid !== '')
           actions.unshift({
             id:'share',
             innerText:'Update shared',
             fun:this.updateShared,
             args:[uid]
           },
           {
             id:'unshare',
             innerText:'Unshare',
             fun:this.unshare,
             args:[uid]
           })
         else
           actions.unshift({
             id:'share',
             innerText:'Share',
             fun:this.share,
             args:[uid]
           })
         }
         this.contextMenu.open(actions, ev)
       }) 
  }
  /*
   * Write project from current scope to localStorage.
   * @param {string} uid - project's uid.
   */
  write (uid){
    uid = uid == undefined ? this.currentUID : uid
    storage.set(`project-${uid}`, JSON.stringify(this.projects[uid]))
  }
  /*
   * Rename a project.
   * @param {string} uid - Project's uid
   * @param {string} name - Old project's name
   */
  rename (uid, name){
    this.contextMenu.oninput({
      title:"Project's name",
      placeholder:name,
      value:name
    }, (input, ev) => {
      ev.preventDefault()
      let name = input.value

      this.contextMenu.close()

      if (name == undefined || name == '')
        return
      
      let obj = {...this.projects[uid].project}
      obj.name = name
      
      this.update({project:obj}, uid)
    })
  }
  /*
   * Update project data on all tabs then from current scope write to localStorage
   * @param {Object} data - changed project data
   * @param {String} uid - project's uid
   */
  update (data, uid){
    uid = uid == undefined ? this.currentUID : uid
    // Update lastEdited
    if (!data.hasOwnProperty('project'))
      data.project = {...this.projects[uid].project}
    data.project.lastEdited = +new Date()

    command.dispatch(this, 'update', [uid, data, command.tabUID])
    // Update localStorage once
    storage.set(`project-${uid}`, JSON.stringify(this.projects[uid]))
  }
  _update (uid, data, tabUID){
    for (const key in data){
      if (key != 'load')
        this.projects[uid][key] = data[key]
    }
    if (data.hasOwnProperty('load') && data.load == false)
      return
    for (const key in data){
      switch (key) {
        case 'project':
          if (this.inited) {
            DOM.lazyUpdate(this._dom.projects._dom, uid, {
              name: data[key].name,
              lastEdited: Tool.prettyEditedAt(data[key].lastEdited),
              sharedUID: data[key].shared.uid
            })
            let _dom = DOM.get(`[data-uid='${uid}']`, this._dom.projects)
            if (data[key].shared.uid != '')
             _dom.classList.add('shared')
            else
             _dom.classList.remove('shared')
          }
          break
        default:
          if (uid == this.currentUID){
            for (const key in data){
              if (typeof window.bipes.page[key].load == 'function' && this.projects.hasOwnProperty(uid) && key != 'project')
                window.bipes.page[key].load(data[key], tabUID)
          }
        }
      }
    }
  }
  /**
   * Get the most recent project by last edited date.
   */
  _mostRecent (){
    let timestamp = 0,
        uid
    for (const key in this.projects) {
      if (this.projects[key].project.lastEdited > timestamp)
        timestamp = this.projects[key].project.lastEdited,
        uid = key
    }
    return uid
  }
  /**
   * Download a project to the computer
   * @param {string} uid - Project uid
   */
  download (uid){
    let proj = JSON.stringify(this.projects[uid])
    // Strip shared metadata.
    proj = proj.replace(/("shared":{"uid":")(.*?)(","token":")(.*?)("})/g,'$1$3$5')
    DOM.prototypeDownload(`${this.projects[uid].project.name}.bipes.json`,proj)
    this.contextMenu.close()
  }
  /**
   * Share a local project.
   * @param {string} uid - Project uid
   */
  share (uid){
    this.contextMenu.close()
    if (!this.hasOwnProperty('shared'))
      return

    API.do('project/cp', {
      cors_token:this.cors_token,
      data:this.projects[uid] 
    }).then(obj => {
      let proj = {...this.projects[uid].project}
      proj.shared = {
        uid:obj.uid,
        token:obj.token
      }
      
      this.update({project:proj}, uid) 
      this.shared._dom.projects._dom.insertBefore(
        this.shared._domCard({
          uid:obj.uid,
          name:proj.name,
          author:proj.author,
          lastEdited:proj.lastEdited,
        })._dom,
        this.shared._dom.projects._dom.firstChild
      )
     }).catch(e => {console.error(e)})
  }
  /**
   * Update a shared project with the local project.
   * @param {string} uid - Project uid
   */
  updateShared (uid){
    this.contextMenu.close()
    let proj = this.projects[uid].project
    if (!this.hasOwnProperty('shared'))
      return

    API.do('project/w', {
      cors_token:this.cors_token,
      data:this.projects[uid]
    }).then(obj => {
      // Server returns uid
      if (obj.uid !== proj.shared.uid)
        return
      // Update DOM in the shared list if fetched
      DOM.lazyUpdate(this.shared._dom.projects,
        proj.shared.uid, {
        name: proj.name,
        author: `By ${proj.author}`,
        lastEdited: Tool.prettyEditedAt(proj.lastEdited)
      })
    }).catch(e => {console.error(e)})
  }
  /**
   * Unshare a local project.
   * @param {string} uid - Project uid
   */
  unshare (uid){
    this.contextMenu.close()
    let proj = this.projects[uid].project
    if (!this.hasOwnProperty('shared'))
      return
    API.do('project/rm', {
      uid:proj.shared.uid,
      token:proj.shared.token,
      cors_token:this.cors_token
    }).then(obj => {
      // Server returns uid
      if (obj.uid !== proj.shared.uid)
        return
      try {
        let _proj = {...this.projects[uid].project}
        _proj.shared = {
          uid:'',
          token:''
        }
        this.update({project:_proj}, uid)      
      } catch(e){}
      let dom = DOM.get(`[data-uid='${obj.uid}']`, this.shared._dom.projects)
      if (dom !== null)
        dom.remove()
    }).catch(e => {console.error(e)})
  }
  /*
   * Upload a project to the platform.
   * @param {string} ev - Input on change event, contains the input node as target.
   */
  upload (ev){
    if  (ev.target.files [0] == undefined)
      return

    let file = ev.target.files[0]

    let reader = new FileReader()
    reader.onload = (e) => {
      this.new(ev, e.target.result)
    }
    reader.readAsText(file)
  }
}
/* Show shared projects */
class SharedProject {
  constructor (parent, dom){
    this.parent = parent
    // This is a lazy object and is not in sync with the DOM list.
    this.projects = []
    this.inited = false
    this.firstInited = false    

    let $ = this._dom = {}

    $.projects = new DOM('span', {className:'listy'})

    dom.append([
      new DOM('div', {id:'shared-projects'})
        .append([
          new DOM('div', {className:'header'})
            .append([
              new DOM('h3', {innerText:'Shared projects'})
            ]),
            $.projects,
            new DOM('span', {className:'listy more-button'})
              .append([
                new DOM('button', {title:'Load more'})
                  .append([new DOM('div', {className:'button icon'})])
                  .onclick(this, this.fetchAutoFrom)
              ])
        ])
    ]) 
  }
  init (){
    if (!this.firstInited) {
      this.fetchSome({from: +new Date(), limit:5})
      this.firstInited = true
    }
    if (this.inited)
      return

    let doms = []
    this.projects.forEach(proj => doms.unshift(this._domCard(proj)))
    this._dom.projects.append(doms)

    this.inited = true
  }
  deinit (){
    if (!this.inited)
      return

    this.inited = false
  }
  /*
   * Fetch some shared projects.
   * @param{Object} args - Arguments to pass to the project ls command,
   *                       send empty {} object to fetch latest batch.
   * @param{bool} notify- True to throw a notification.
   */
  async fetchSome (args, notify){
    API.do('project/ls', args)
      .then(obj => { 
        let doms = []
        // Push unique values and also return an array of these unique
        Tool.pushUnique(this.projects, obj.projects, 'uid')
          .forEach(unique => doms.unshift(this._domCard(unique)))
        this._dom.projects.append(doms)
        if (doms.length == 0 && notify === true)
          notification.send('Project: No older shared projects.')
      })
      .catch(e => {console.error(e)})
  }
  /*
   * Clone a shared project.
   * @param{string} uid - shared project unique public id.
   */
  async clone (uid){
   API.do('project/o', {uid:uid})
    .then(obj => {
      if (obj.hasOwnProperty('projects'))
        this.parent.new(undefined, obj.projects[0].data)
      else
        notification.send('Project: Shared project does not exist anymore.')
    }) 
    .catch(e => {console.error(e)})
  }
  /*
   * Automatically fetch a new from to lastEdited interval.
   */
  fetchAutoFrom (){
    // Get oldest edited project
    let obj = Tool.getMin(this.projects, 'lastEdited') 
    if (obj !== null)
      this.fetchSome({from:obj.lastEdited, limit:10}, true)
    else
      this.fetchSome({from:+new Date(), limit:10}, true)
  }
  /*
   * Creates a DOM shared project card
   */
  _domCard (item){
    return new DOM('button', {uid: item.uid})
      .append([
        new DOM('div', {className:'row'}).append([
          new DOM('h4', {
            id:'name',
            innerText: item.name
          }),
          new DOM('div', {
            id:'uid',
            innerText: item.uid
          })
        ]),
        new DOM('div', {className:'row'}).append([
          new DOM('span', {
            id:'author',
            innerText: `By ${item.author}`
          }),
          new DOM('div', {
            id:'lastEdited',
            innerText: Tool.prettyEditedAt(item.lastEdited)
          })
        ])
      ])
      .onclick(this, this.clone, [item.uid]) 
  }
}

export let project = new Project()
