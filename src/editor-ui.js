const path = require('node:path');

const uiDir = __dirname;

module.exports = function mountEditorUi(app) {
    app.get('/', (req, res) => res.redirect('/editor'));
    app.get('/editor', (req, res) => res.sendFile(path.join(uiDir, 'editor-ui.html')));
    app.get('/editor.js', (req, res) => res.type('application/javascript').sendFile(path.join(uiDir, 'editor-ui-client.js')));
};
