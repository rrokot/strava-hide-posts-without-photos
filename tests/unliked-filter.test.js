const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'strava-photo-filter-toggle.user.js');

function readScript() {
    return fs.readFileSync(scriptPath, 'utf8');
}

test('userscript has no unresolved merge conflict markers', () => {
    const source = readScript();

    assert.equal(source.includes('<<<<<<<'), false);
    assert.equal(source.includes('======='), false);
    assert.equal(source.includes('>>>>>>>'), false);
});

test('filter buttons are explicit non-submit buttons', () => {
    const source = readScript();

    assert.match(source, /button\.type\s*=\s*['"]button['"]/);
});

class FakeElement {
    constructor({ selectors = {}, textContent = '', attributes = {}, classes = [] } = {}) {
        this.nodeType = 1;
        this.textContent = textContent;
        this.attributes = new Map(Object.entries(attributes));
        this.classList = {
            contains: (name) => classes.includes(name)
        };
        this.selectors = selectors;
    }

    querySelector(selector) {
        const selectors = selector.split(',').map((part) => part.trim());
        for (const selectorPart of selectors) {
            if (this.selectors[selectorPart]) {
                return this.selectors[selectorPart];
            }
        }

        return this.selectors[selector] || null;
    }

    querySelectorAll() {
        return [];
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }
}

function loadTestApi() {
    const body = new FakeElement();
    body.classList = { toggle() {}, contains() { return false; } };
    const document = {
        body,
        head: { appendChild() {} },
        createElement: () => new FakeElement(),
        getElementById: () => null,
        querySelector: () => null
    };
    const window = {
        __STRAVA_FEED_FILTERS_TEST__: true,
        addEventListener() {}
    };

    vm.runInNewContext(readScript(), {
        document,
        window,
        localStorage: { getItem: () => null, setItem() {} },
        MutationObserver: class { observe() {} disconnect() {} },
        Node: { ELEMENT_NODE: 1 },
        console
    });

    return window.__stravaFeedFiltersTestApi;
}

test('analyzeEntry marks entries liked by me from pressed kudos button state', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            'aria-pressed': 'true',
            'aria-label': 'Kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="photo"], [data-testid="video"]': new FakeElement(),
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, true);
});

test('analyzeEntry keeps unliked entries visible when kudos button is not pressed', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            'aria-pressed': 'false',
            'aria-label': 'Give Kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, false);
});

test('analyzeEntry keeps entries with a Give kudos button visible', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            title: 'Give kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, false);
});

test('analyzeEntry hides entries whose kudos button no longer offers Give kudos', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            title: 'View kudos'
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, true);
});

test('analyzeEntry hides entries with Strava filled kudos button', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            title: 'View all kudos',
            'data-testid': 'kudos_button'
        },
        selectors: {
            'svg[data-testid="filled_kudos"]': new FakeElement()
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, true);
});

test('analyzeEntry keeps entries with Strava unfilled kudos button visible', () => {
    const api = loadTestApi();
    const kudosButton = new FakeElement({
        attributes: {
            title: 'Give kudos',
            'data-testid': 'kudos_button'
        },
        selectors: {
            'svg[data-testid="unfilled_kudos"]': new FakeElement()
        }
    });
    const entry = new FakeElement({
        selectors: {
            '[data-testid="kudos_button"]': kudosButton
        }
    });

    assert.equal(api.analyzeEntry(entry).likedByMe, false);
});

test('analyzeEntry does not assume entries without a kudos button are liked', () => {
    const api = loadTestApi();
    const entry = new FakeElement();

    assert.equal(api.analyzeEntry(entry).likedByMe, false);
});
