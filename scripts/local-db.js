/**
 * LocalDB Module - localStorage-backed table CRUD + channel emitter
 * Provides a thin data layer that local-storage.js builds upon.
 * Tables are stored as JSON arrays under the `dartbee_` prefix.
 */

const LocalDB = (() => {
    const PREFIX = 'dartbee_';

    // ---------- Event bus ----------
    const listeners = {}; // { table: [{ event, filter, callback }] }

    function emit(table, event, row) {
        (listeners[table] || []).forEach(l => {
            if (l.event === '*' || l.event === event) {
                // Apply filter if present
                if (l.filter) {
                    const match = Object.entries(l.filter).every(([k, v]) => {
                        // Support "col=eq.value" style filters
                        if (typeof v === 'string' && v.startsWith('eq.')) {
                            return String(row[k]) === v.slice(3);
                        }
                        return row[k] === v;
                    });
                    if (!match) return;
                }
                try {
                    l.callback({
                        eventType: event,
                        new: event === 'DELETE' ? null : row,
                        old: event === 'INSERT' ? null : row,
                        table: table
                    });
                } catch (e) {
                    console.error('LocalDB event handler error:', e);
                }
            }
        });
    }

    // ---------- Table CRUD ----------

    function getTable(name) {
        try {
            const raw = localStorage.getItem(PREFIX + name);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error(`LocalDB: error reading table "${name}"`, e);
            return [];
        }
    }

    function setTable(name, rows) {
        try {
            localStorage.setItem(PREFIX + name, JSON.stringify(rows));
        } catch (e) {
            console.error(`LocalDB: error writing table "${name}" (quota exceeded?)`, e);
        }
    }

    function insertRows(table, rows) {
        const current = getTable(table);
        const inserted = [];
        rows.forEach(row => {
            current.push(row);
            inserted.push(row);
        });
        setTable(table, current);
        inserted.forEach(r => emit(table, 'INSERT', r));
        return inserted;
    }

    function updateRows(table, matchFn, updateFn) {
        const current = getTable(table);
        const updated = [];
        const next = current.map(row => {
            if (matchFn(row)) {
                const merged = updateFn(row);
                updated.push(merged);
                return merged;
            }
            return row;
        });
        setTable(table, next);
        updated.forEach(r => emit(table, 'UPDATE', r));
        return updated;
    }

    function deleteRows(table, matchFn) {
        const current = getTable(table);
        const deleted = [];
        const next = current.filter(row => {
            if (matchFn(row)) {
                deleted.push(row);
                return false;
            }
            return true;
        });
        setTable(table, next);
        deleted.forEach(r => emit(table, 'DELETE', r));
        return deleted;
    }

    // ---------- Channel shim ----------
    // Mimics Supabase realtime: supabase.channel(name).on(...).subscribe(statusCb)

    let channelCounter = 0;

    function channel(name) {
        const channelId = `ch_${++channelCounter}_${name}`;
        const registrations = []; // collected .on() calls

        const ch = {
            _id: channelId,
            _registrations: registrations,
            on(type, config, callback) {
                // type is 'postgres_changes'
                // config: { event, schema, table, filter? }
                if (type === 'postgres_changes' && config && callback) {
                    const tableName = config.table;
                    let filterObj = null;
                    if (config.filter) {
                        // Parse "id=eq.xxx" style filter
                        const parts = config.filter.split('=');
                        if (parts.length >= 2) {
                            filterObj = { [parts[0]]: parts.slice(1).join('=') };
                        }
                    }
                    const entry = {
                        event: config.event || '*',
                        filter: filterObj,
                        callback: callback
                    };
                    registrations.push({ table: tableName, entry });
                }
                return ch; // chainable
            },
            subscribe(statusCb) {
                // Register all listeners
                registrations.forEach(({ table: t, entry }) => {
                    if (!listeners[t]) listeners[t] = [];
                    entry._channelId = channelId;
                    listeners[t].push(entry);
                });
                // Invoke status callback
                if (typeof statusCb === 'function') {
                    setTimeout(() => statusCb('SUBSCRIBED'), 0);
                }
                return ch;
            }
        };

        return ch;
    }

    function removeChannel(ch) {
        if (!ch || !ch._id) return;
        const channelId = ch._id;
        // Remove all listeners belonging to this channel
        Object.keys(listeners).forEach(table => {
            listeners[table] = (listeners[table] || []).filter(
                l => l._channelId !== channelId
            );
        });
    }

    // Public API
    return {
        getTable,
        setTable,
        insertRows,
        updateRows,
        deleteRows,
        emit,
        channel,
        removeChannel
    };
})();
