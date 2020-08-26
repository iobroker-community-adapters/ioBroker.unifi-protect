var secret;



// the function loadSettings has to exist ...
async function load(settings, onChange) {
    socket.emit('getObject', 'system.config', function (err, obj) {
        secret = (obj.native ? obj.native.secret : '') || 'Y5JQ6qCfnhysf9NG';
        loadHelper(settings, onChange);
    });

    onChange(false);
}

// the function loadSettings has to exist ...
async function loadHelper(settings, onChange) {
    // example: select elements with id=key and class=value and insert value
    if (!settings) return;
    if (settings.electricityPollingInterval === undefined) settings.electricityPollingInterval = 20;

    $('.value').each(function () {
        var $key = $(this);
        var id = $key.attr('id');
        if (id === 'password') {
            settings[id] = decrypt(secret, settings[id]);
        }

        if ($key.attr('type') === 'checkbox') {
            // do not call onChange direct, because onChange could expect some arguments
            $key.prop('checked', settings[id]).change(function () {
                onChange();
            });
        } else {
            // do not call onChange direct, because onChange could expect some arguments
            $key.val(settings[id]).change(function () {
                onChange();
            }).keyup(function () {
                onChange();
            });
        }
    });

    await createTreeViews(settings, onChange);


    onChange(false);

    // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
    if (M) M.updateTextFields();
}

/**
 * @param {*} settings 
 * @param {*} onChange 
 */
async function createTreeViews(settings, onChange) {
    for (const key of Object.keys(settings.statesFilter)) {

        try {
            let tree = []

            // get json data from file
            const propList = await getUnifiObjects(key);

            let children = [];
            let expanded = false;
            for (const child of propList) {

                let selected = false;
                if (settings.statesFilter[key] && settings.statesFilter[key].includes(child.id)) {
                    selected = true;
                    expanded = true;
                }

                children.push({
                    title: `<div class="fancytree-item-title-id">${child.id}</div><div class="fancytree-item-title-name">${_(child.name)}</div>`,
                    key: `${key}.${child.id}`,
                    selected: selected
                })
            }

            tree.push({
                title: `<div class="fancytree-folder-title-id">${key}</div><div class="fancytree-item-title-name">${_(`root_${key}`)}</div>`,
                key: key,
                folder: true,
                expanded: true,
                children: children
            })


            $(`#tree_${key}`).fancytree({
                activeVisible: true,                        // Make sure, active nodes are visible (expanded)
                aria: true,                                 // Enable WAI-ARIA support
                autoActivate: true,                         // Automatically activate a node when it is focused using keyboard
                autoCollapse: false,                        // Automatically collapse all siblings, when a node is expanded
                autoScroll: false,                          // Automatically scroll nodes into visible area
                clickFolderMode: 2,                         // 1:activate, 2:expand, 3:activate and expand, 4:activate (dblclick expands)
                checkbox: true,                             // Show check boxes
                checkboxAutoHide: false,                    // Display check boxes on hover only
                debugLevel: 0,                              // 0:quiet, 1:errors, 2:warnings, 3:infos, 4:debug
                disabled: false,                            // Disable control
                focusOnSelect: false,                       // Set focus when node is checked by a mouse click
                escapeTitles: false,                        // Escape `node.title` content for display
                generateIds: false,                         // Generate id attributes like <span id='fancytree-id-KEY'>
                keyboard: true,                             // Support keyboard navigation
                keyPathSeparator: "/",                      // Used by node.getKeyPath() and tree.loadKeyPath()
                minExpandLevel: 1,                          // 1: root node is not collapsible
                quicksearch: false,                         // Navigate to next node by typing the first letters
                rtl: false,                                 // Enable RTL (right-to-left) mode
                selectMode: 3,                              // 1:single, 2:multi, 3:multi-hier
                tabindex: "0",                              // Whole tree behaves as one single control
                titlesTabbable: false,                      // Node titles can receive keyboard focus
                tooltip: false,                             // Use title as tooltip (also a callback could be specified)
                // icon: function (event, data) {
                //     if (data.node.isFolder()) {
                //         return "unifi.png";
                //     }
                // },
                source:
                    tree
                ,
                click: function (event, data) {
                    if (data.targetType === 'title' && !data.node.folder) {
                        data.node.setSelected(!data.node.isSelected());
                    }

                    if (data.targetType === 'checkbox' && data.node.folder) {
                        data.node.setExpanded(!data.node.isSelected());
                    }
                },
                select: function (event, data) {

                    // Funktion um alle title auszulesen, kann für Übersetzung verwendet werden -> bitte drin lassen!
                    // var selKeys = $.map(data.tree.getSelectedNodes(), function (node) {
                    //     if (node.children === null) {
                    //         return node.title;
                    //     }
                    // });
                    // console.log(selKeys.join('\n').replace(/_/g, " "));

                    onChange();
                }
            });

            // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
            if (M) M.updateTextFields();
            
        } catch (err) {
            console.error(`[createTreeViews] key: ${key} error: ${err.message}, stack: ${err.stack}`);
        }
    }
}

/**
 * @param {*} lib 
 */
async function getUnifiObjects(lib) {
    return new Promise((resolve, reject) => {
        $.getJSON(`./lib/objects_${lib}.json`, function (json) {
            if (json) {
                resolve(json);
            } else {
                resolve(null);
            }
        });
    });
}

function encrypt(key, value) {
    var result = '';
    for (var i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function decrypt(key, value) {
    var result = '';
    for (var i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

// This will be called by the admin adapter when the user presses the save button
function save(callback) {
    // example: select elements with class=value and build settings object
    var obj = {};
    $('.value').each(function () {
        var $this = $(this);
        var id = $this.attr('id');

        if ($this.attr('type') === 'checkbox') {
            obj[id] = $this.prop('checked');
        } else {
            var value = $this.val();
            if (id === 'password') {
                value = encrypt(secret, value);
            }
            obj[id] = value;
        }
    });

    callback(obj);
}