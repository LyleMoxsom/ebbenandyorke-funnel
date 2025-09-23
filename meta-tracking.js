(function (window) {
    'use strict';

    const ATTRIBUTION_FIELD_NAMES = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'fbc',
        'fbp',
        'gclid',
        'msclkid',
        'wbraid',
        'gbraid',
        'landing_page',
        'referrer'
    ];

    const STORAGE_KEYS = {
        attribution: 'metaAttributionData',
        lead: 'metaLeadSubmission',
        events: 'metaCapiEventsSent'
    };

    const DEFAULT_CONFIG = {
        endpoint: 'https://services.leadconnectorhq.com/hooks/2y2XmPsJl1txt36sI8q3/facebook/capi',
        pixelId: '1202717601883540',
        partnerName: 'Ebben & Yorke Funnel'
    };

    function getConfig() {
        const override = window.metaCapiConfig || {};
        return Object.assign({}, DEFAULT_CONFIG, override);
    }

    function getCookieValue(name) {
        if (typeof document === 'undefined') return '';
        const value = document.cookie
            .split(';')
            .map(part => part.trim())
            .find(cookie => cookie.startsWith(name + '='));
        return value ? decodeURIComponent(value.split('=').slice(1).join('=')) : '';
    }

    function safeParseJSON(value) {
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('MetaTracking: failed to parse JSON', error);
            return null;
        }
    }

    function getStoredAttributionData() {
        return safeParseJSON(localStorage.getItem(STORAGE_KEYS.attribution)) || {};
    }

    function collectAttributionData() {
        if (typeof window === 'undefined') return {};
        const params = new URLSearchParams(window.location.search);
        const stored = getStoredAttributionData();
        const data = Object.assign({}, stored);

        ATTRIBUTION_FIELD_NAMES.forEach(field => {
            if (params.has(field) && params.get(field)) {
                data[field] = params.get(field);
            }
        });

        const fbclid = params.get('fbclid');
        if (fbclid) {
            data.fbclid = fbclid;
            data.fbc = `fb.1.${Date.now()}.${fbclid}`;
        }

        if (!data.fbc) {
            const fbcCookie = getCookieValue('_fbc');
            if (fbcCookie) {
                data.fbc = fbcCookie;
            }
        }

        if (!data.fbp) {
            const fbpCookie = getCookieValue('_fbp');
            if (fbpCookie) {
                data.fbp = fbpCookie;
            }
        }

        if (!data.landing_page) {
            data.landing_page = window.location.href;
        }

        if (document.referrer && !data.referrer) {
            data.referrer = document.referrer;
        }

        data.last_touch_url = window.location.href;
        data.last_touch_time = Date.now();

        localStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(data));
        return data;
    }

    function populateHiddenFields(form, data) {
        if (!form || !data) return;
        ATTRIBUTION_FIELD_NAMES.forEach(field => {
            const input = form.querySelector(`input[name="${field}"]`);
            if (input) {
                input.value = data[field] || '';
            }
        });
    }

    function appendAttributionToPayload(target, form) {
        if (!target) return target;
        const attribution = getStoredAttributionData();
        ATTRIBUTION_FIELD_NAMES.forEach(field => {
            const input = form ? form.querySelector(`input[name="${field}"]`) : null;
            const value = input && input.value ? input.value : attribution[field];
            if (value) {
                target[field] = value;
            }
        });
        return target;
    }

    function generateEventId(prefix = 'event') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function storeLeadSubmission(formValues, eventId) {
        if (!formValues) return;
        const attribution = getStoredAttributionData();
        const record = {
            lead: {
                first_name: formValues.first_name || '',
                last_name: formValues.last_name || '',
                phone: formValues.phone || '',
                email: formValues.email || '',
                postcode: formValues.postcode || '',
                property_type: formValues.property_type || '',
                property_ownership: formValues.property_ownership || '',
                budget: formValues.budget || '',
                message: formValues.message || '',
                page_url: formValues.page_url || window.location.href,
                user_agent: formValues.user_agent || navigator.userAgent
            },
            attribution,
            meta_event_id: eventId || formValues.meta_event_id || generateEventId('lead'),
            submitted_at: Date.now()
        };

        localStorage.setItem(STORAGE_KEYS.lead, JSON.stringify(record));
        localStorage.removeItem(STORAGE_KEYS.events);
        return record;
    }

    function getStoredLeadSubmission() {
        return safeParseJSON(localStorage.getItem(STORAGE_KEYS.lead));
    }

    function getSentEvents() {
        return safeParseJSON(localStorage.getItem(STORAGE_KEYS.events)) || {};
    }

    function setSentEvent(key, value) {
        const events = getSentEvents();
        events[key] = value;
        localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
    }

    async function hashData(value) {
        if (!value) return '';
        const normalised = value.toString().trim().toLowerCase();
        if (!normalised) return '';

        if (!window.crypto || !window.crypto.subtle) {
            console.warn('MetaTracking: Web Crypto API unavailable, skipping hash for value.');
            return '';
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(normalised);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function normalisePhone(value) {
        if (!value) return '';
        const digits = value.toString().replace(/[^0-9+]/g, '');
        if (!digits) return '';
        if (digits.startsWith('+')) {
            return digits.slice(1);
        }
        if (digits.startsWith('00')) {
            return digits.slice(2);
        }
        if (digits.startsWith('0')) {
            return '44' + digits.slice(1);
        }
        return digits;
    }

    function buildCustomData(lead, attribution) {
        const custom = {
            property_type: lead.property_type || '',
            property_ownership: lead.property_ownership || '',
            budget: lead.budget || '',
            message: lead.message || '',
            form_page_url: lead.page_url || '',
            landing_page: attribution.landing_page || '',
            referrer: attribution.referrer || '',
            last_touch_url: attribution.last_touch_url || '',
            fbclid: attribution.fbclid || '',
            utm_source: attribution.utm_source || '',
            utm_medium: attribution.utm_medium || '',
            utm_campaign: attribution.utm_campaign || '',
            utm_term: attribution.utm_term || '',
            utm_content: attribution.utm_content || '',
            gclid: attribution.gclid || '',
            msclkid: attribution.msclkid || '',
            wbraid: attribution.wbraid || '',
            gbraid: attribution.gbraid || ''
        };

        return custom;
    }

    async function buildUserData(lead, attribution) {
        const userData = {};
        const [emailHash, phoneHash, firstHash, lastHash, postcodeHash, externalId] = await Promise.all([
            hashData(lead.email),
            hashData(normalisePhone(lead.phone)),
            hashData(lead.first_name),
            hashData(lead.last_name),
            hashData((lead.postcode || '').replace(/\s+/g, '')),
            hashData(lead.email || lead.phone || '')
        ]);

        if (emailHash) {
            userData.em = emailHash;
            userData.external_id = externalId || emailHash;
        } else if (externalId) {
            userData.external_id = externalId;
        }

        if (phoneHash) {
            userData.ph = phoneHash;
        }

        if (firstHash) {
            userData.fn = firstHash;
        }

        if (lastHash) {
            userData.ln = lastHash;
        }

        if (postcodeHash) {
            userData.zp = postcodeHash;
        }

        if (attribution.fbc) {
            userData.fbc = attribution.fbc;
        }

        if (attribution.fbp) {
            userData.fbp = attribution.fbp;
        }

        userData.client_user_agent = navigator.userAgent;

        return userData;
    }

    async function sendCapiEvent(eventName, options = {}) {
        const record = getStoredLeadSubmission();
        if (!record) {
            console.warn('MetaTracking: no stored lead submission available for CAPI event.');
            return;
        }

        const eventKey = options.eventKey || `${eventName}${options.eventIdSuffix || ''}`;
        const sentEvents = getSentEvents();
        if (!options.force && sentEvents[eventKey]) {
            return;
        }

        const config = getConfig();
        const eventIdBase = options.eventId || record.meta_event_id || generateEventId(eventName.toLowerCase());
        const eventId = `${eventIdBase}${options.eventIdSuffix || ''}`;

        try {
            const [userData, customData] = await Promise.all([
                buildUserData(record.lead, record.attribution || {}),
                Promise.resolve(buildCustomData(record.lead, record.attribution || {}))
            ]);

            const payload = {
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                action_source: 'website',
                event_id: eventId,
                event_source_url: options.eventSourceUrl || window.location.href,
                user_data: userData,
                custom_data: customData
            };

            const requestBody = {
                pixel_id: config.pixelId,
                data: [payload]
            };

            if (config.partnerName) {
                requestBody.partner_name = config.partnerName;
            }

            if (config.testEventCode) {
                requestBody.test_event_code = config.testEventCode;
            }

            const response = await fetch(config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const message = await response.text();
                console.error('MetaTracking: failed to send CAPI event', response.status, message);
                return;
            }

            setSentEvent(eventKey, {
                sent_at: Date.now(),
                event_id: eventId,
                name: eventName
            });
        } catch (error) {
            console.error('MetaTracking: error while sending CAPI event', error);
        }
    }

    function clearLeadSubmission() {
        localStorage.removeItem(STORAGE_KEYS.lead);
        localStorage.removeItem(STORAGE_KEYS.events);
    }

    window.MetaTracking = {
        collectAttributionData,
        populateHiddenFields,
        appendAttributionToPayload,
        generateEventId,
        storeLeadSubmission,
        getStoredLeadSubmission,
        getStoredAttributionData,
        sendCapiEvent,
        clearLeadSubmission,
        getAttributionFieldNames: () => ATTRIBUTION_FIELD_NAMES.slice()
    };
})(window);
