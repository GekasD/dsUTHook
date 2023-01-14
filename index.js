const cron = require('node-cron');
const cronstrue = require('cronstrue');
const configFile = require('./config.json');
const Parser = require('rss-parser');

// Ελέγχουμε αν υπάρχει webhook url
if (!configFile.webhook_url || configFile.webhook_url === '') {
    console.log('Δεν έχει οριστεί το webhook_url στο config.json!');
    process.exit(1);
}

// Επαληθέυουμε την ορθότητα της cron έκφρασης
if (configFile.cron_string && !cron.validate(configFile.cron_string)) {
    console.log('Υπάρχει λάθος στο cron_string στο config.json!');
    process.exit(1);
}

// Φτιάχνουμε ένα config object για τα settings
const config = {
    webhookUrl: configFile.webhook_url,
    cronString: configFile.cron_string || '*/30 * * * *',
    initial: configFile.initial || false,
    message: configFile.message || '@everyone 🚨 Νέα ανακοίνωση απο το τμήμα ψηφιακών συστημάτων! 🚨'
}

// Μεταβλητή που θα αποθηκέυει το τελευτάιο article id για συγρίσεις
let latestId;

// Φτιάχνουμε το rss parser object
const parser = new Parser();

// Κύρια διαδικασία
async function main() {
    // Παίρνουμε την τελευτάια ανακοίνωση απο το RSS του ΤΨΣ
    const feed = await parser.parseURL('https://ds.uth.gr/feed');
    const lastPost = feed.items[0];

    // Ελέγχουμε αν η τελευταία ανακοίνωση είναι ίδια με την προηγούμενη
    if (!latestId) {
        latestId = lastPost.guid;
        if (!config.initial) return;
    } else {
        if (lastPost.guid === latestId) {
            console.log('Ο τελευταίος έλεγχος δεν βρήκε νέα ανακοίνωση.');
            return;
        } else {
            latestId = lastPost.guid;
            console.log(`Νεα ανακοίνωση με τίτλο: ${lastPost.title}`);
        }
    }

    // Φτιάχνουμε το μύνημα για το Discord
    const data = {
        content: config.message,
        embeds: [
            {
                author: { name: lastPost.creator, icon_url: feed.image.url },
                url: lastPost.link,
                title: lastPost.title,
                description: lastPost.contentSnippet,
                fields: [{ name: 'Κατηγορίες', value: lastPost.categories.join(', ') }],
                image: { url: lastPost.content.match(/<img [^>]*src="([^"]+)"/)[1] },
                timestamp: lastPost.isoDate,
                footer: { text: feed.description }
            }
        ]
    }

    // Στέλνουμε το webhook στο Discord
    await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data) 
    });
}

// Αν είναι ενεργοποιημένο το initial, τρέξε την κύρια διαδικασία μία extra φορά στην αρχή
if (config.initial) main().catch(r => console.error(r));

// Κάνουμε τον έλεγχο να τρέχει στο ωράριο της ρύθμισης "cronString" (config.json), και σταματάμε το πρόγραμμα από τον τερματισμό
cron.schedule(config.cronString, () => main().catch(r => console.error(r)));

// Ειδοποιούμε τον χρήστη
console.log(`Το πρόγραμμα τρέχει, θα κάνει έλεγχο: ${cronstrue.toString(config.cronString)}.`);