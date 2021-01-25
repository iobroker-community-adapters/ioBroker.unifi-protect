let secret;



// the function loadSettings has to exist ...
async function load(settings, onChange) {
	socket.emit("getObject", "system.config", function (err, obj) {
		secret = (obj.native ? obj.native.secret : "") || "Y5JQ6qCfnhysf9NG";
		loadHelper(settings, onChange);
	});

	onChange(false);
}

// the function loadSettings has to exist ...
async function loadHelper(settings, onChange) {
	// example: select elements with id=key and class=value and insert value
	if (!settings) return;
	if (settings.electricityPollingInterval === undefined) settings.electricityPollingInterval = 20;
    
	if (settings.password && (typeof supportsFeature !== "function" || !supportsFeature("ADAPTER_AUTO_DECRYPT_NATIVE"))) {
		settings.password = decrypt(secret, settings.password);
	}

	$(".value").each(function () {
		const $key = $(this);
		const id = $key.attr("id");

		if ($key.attr("type") === "checkbox") {
			// do not call onChange direct, because onChange could expect some arguments
			$key.prop("checked", settings[id]).change(function () {
				onChange();
			});
		} else if ($key.localName == "select") {
			$.each(settings[id] , function(key, value) {
				$key.append(`<option` + (value == true ? " selected" : "") + ` value="${key}">${key}</option>`);
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

	$("#downloadLastMotionThumb").change(function (obj) {
		const $myTree = $("#tree_cameras").fancytree();
		const tree = $myTree.fancytree("getTree");

		const node = tree.getNodeByKey("lastMotion.thumbnail");
		if ($(this).is(":checked")) {
			node.unselectable = true;
			node.selected = true;
		} else {
			node.unselectable = false;
		}
	});

	$("#takeSnapshotForLastMotion").change(function (obj) {
		const $myTree = $("#tree_cameras").fancytree();
		const tree = $myTree.fancytree("getTree");

		const node = tree.getNodeByKey("lastMotion.thumbnail");
		if ($(this).is(":checked")) {
			node.unselectable = true;
			node.selected = true;
		} else {
			node.unselectable = false;
		}
	});

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
			// get json data from file
			const objList = await getUnifiObjects(key);
			const tree = {
				title: `<div class="fancytree-folder-title-id">${key}</div><div class="fancytree-item-title-name">${_(`root_${key}`)}</div>`,
				key: key,
				folder: true,
				expanded: true,
				children: []
			};

			await convertJsonToTreeObject(key, objList, tree, settings);

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
				source: [
					tree
				],
				click: function (event, data) {
					if (data.targetType === "title" && !data.node.folder) {
						data.node.setSelected(!data.node.isSelected());
					}

					if (data.targetType === "checkbox" && data.node.folder) {
						data.node.setExpanded(!data.node.isSelected());
					}
				},
				select: function (event, data) {
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
 * @param {*} key 
 * @param {*} objList 
 * @param {*} tree 
 * @param {*} settings 
 */
async function convertJsonToTreeObject(key, objList, tree, settings, channel = undefined) {
	for (const obj of objList) {

		if (!obj.channel) {
			let selected = false;
			let unselectable = false;
			if (settings.statesFilter[key] && settings.statesFilter[key].includes(`${channel ? channel + "." : ""}${obj.id}`)) {
				selected = true;
				tree.expanded = true;
			}

			if ($("#downloadLastMotionThumb").is(":checked") && `${channel ? channel + "." : ""}${obj.id}` === "lastMotion.thumbnail") {
				selected = true;
				unselectable = true;
			}

			tree.children.push({
				title: `<div class="fancytree-item-title-id">${obj.id}</div><div class="fancytree-item-title-name">${_(obj.name)}</div>`,
				key: `${channel ? channel + "." : ""}${obj.id}`,
				id: `${channel ? channel + "." : ""}${obj.id}`,
				selected: selected,
				unselectable: unselectable
			});
		} else {
			// channel
			const subtree = {
				title: `<div class="fancytree-folder-title-id">${obj.channel}</div><div class="fancytree-item-title-name">${_(`root_${obj.channel}`)}</div>`,
				key: `${obj.channel}`,
				folder: true,
				expanded: false,
				children: []
			};

			await convertJsonToTreeObject(key, obj.states, subtree, settings, `${channel ? channel + "." : ""}${obj.channel}`);

			tree.children.push(subtree);
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

// This will be called by the admin adapter when the user presses the save button
function save(callback) {
	// example: select elements with class=value and build settings object
	const obj = {};
	$(".value").each(function () {
		const $this = $(this);
		const id = $this.attr("id");

		if ($this.attr("type") === "checkbox") {
			obj[id] = $this.prop("checked");
		} else {
			let value = $this.val();
			if (id === "password" && (typeof supportsFeature !== "function" || !supportsFeature("ADAPTER_AUTO_DECRYPT_NATIVE"))) {
				value = encrypt(secret, value);
			}
			obj[id] = value;
		}
	});

	//Process statesFilter
	obj.statesFilter = {};
	$("[id*=tree_]").each(function () {
		const settingsName = $(this).attr("id").replace("tree_", "");

		const selected = $.ui.fancytree.getTree(`#tree_${settingsName}`).getSelectedNodes();
		const selectedIds = $.map(selected, function (node) {
			return node.data.id;
		});

		obj.statesFilter[settingsName] = selectedIds;
	});


	callback(obj);
}