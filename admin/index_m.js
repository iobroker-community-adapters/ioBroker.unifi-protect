var secret;

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

// the function loadSettings has to exist ...
function loadHelper(settings, onChange) {
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
    onChange(false);
    M.updateTextFields();  // function Materialize.updateTextFields(); to reinitialize all the Materialize labels on the page if you are dynamically adding inputs.
}

// the function loadSettings has to exist ...
function load(settings, onChange) {
    socket.emit('getObject', 'system.config', function (err, obj) {
        secret = (obj.native ? obj.native.secret : '') || 'Y5JQ6qCfnhysf9NG';
        loadHelper(settings, onChange);
    });

    onChange(false);
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