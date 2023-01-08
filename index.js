const axios = require('axios').default;
const cheerio = require('cheerio');
const cron = require('node-cron');
const cronstrue = require('cronstrue');
const configFile = require('./config.json');

// Ελέγχουμε αν υπάρχει webhook url
if (!configFile.webhook_url || configFile.webhook_url === '') {
    console.log('Δεν έχει οριστεί το webhook_url στο config.json!');
    process.exit();
}

// Επαληθέυουμε την ορθότητα της cron έκφρασης
if (configFile.cron_string && !cron.validate(configFile.cron_string)) {
    console.log('Υπάρχει λάθος στο cron_string στο config.json!');
    process.exit();
}

// Φτιάχνουμε ένα config object για τα settings
const config = {
    webhookUrl: configFile.webhook_url,
    cronString: configFile.cron_string || '*/10 * * * *',
    initial: configFile.initial || false,
    message: configFile.message || '@everyone 🚨 Νέα ανακοίνωση απο το τμήμα ψηφιακών συστημάτων! 🚨',
    footer: configFile.footer || 'Παρέχεται με ❤️ απο τον Γκέκα Δημήτριο'
}

// Διαδικασία που επιστρέφει την τελευταία ανακοίνωση με web scraping
async function getLatestAnnouncement() {
    // Κατεβάζουμε το html και το κάνουμε parse με το cheerio
    const res = await axios.get('https://ds.uth.gr/category/%CE%B1%CE%BD%CE%B1%CE%BA%CE%BF%CE%B9%CE%BD%CF%8E%CF%83%CE%B5%CE%B9%CF%82/');
    const $ = cheerio.load(res.data);

    // Τα αρθρα "article" (ακανοινώσεις) βρισκονται κάτω απο ένα div με το id #left-area
    // Εδώ παίρνουμε την λίστα με τα άρθρα, και καλούμε την μέθοδο first() για να πάρουμε το τελευταίο άρθρο
    const article = $('#left-area > article').first();

    // Επιστρέφουμε όλα τα δεδομένα που θέλουμε σε ένα οργανωμένο article object
    return {
        id: article.attr('id'),
        title: article.find('.entry-title').text(),
        href: article.find('.entry-title a').attr('href'),
        imageUrl: article.find('img').attr('src'),
        content: article.contents().filter((i, el) => el.type === 'text').text().trim(),
        author: {
            name: article.find('.author').text(),
            href: article.find('.author > a').attr('href')
        },
        date: article.find('.published').text().trim()
    }
}

// Μεταβλητή που θα αποθηκέυει το τελευτάιο article id για συγρίσεις
let latestId;

// Κύρια διαδικασία
async function main() {
    // Πάρε την τελευτάια ανακοίνωση του ΤΨΣ
    let announcement;
    try {
        announcement = await getLatestAnnouncement();
    } catch (e) {
        console.error('Aποτυχία στην παραλαβή δεδομένων απο το ds.uth.gr: ', e)
        return;
    }

    // Αν το latestId δεν έχει οριστεί ακόμα, τότε είναι ο πρώτος έλεγχος στην πάρουσα ζωή του προγράμματος,
    // το ορίζουμε και στέλνουμε την τελευταία ανακοίνωση. (εφόσον το initial είναι true)
    // Αλλιώς συγκίνουμε το νέο id με το παλιό και πέρνουμε τις ανάλογες ενέργειες,
    // ελέγχουμε αν το id της τελευταίας ανακόινωσης είναι το ίδιο, αν είναι τότε δεν υπάρχει καινουρια ανακοίνωση και σταματάμε
    if (!latestId) {
        latestId = announcement.id;
        if (!config.initial) return;
    } else {
        if (announcement.id === latestId) {
            console.log(`Ο τελευταίος έλεγχος δεν βρήκε νέα ανακοίνωση.`);
            return;
        } else {
            latestId = announcement.id;
            console.log(`Νεα ανακοίνωση με τίτλο: ${announcement.title}`);
        };
    }

    // Φτιάχνουμε το μύνημα για το Discord
    const data = {
        content: config.message,
        embeds: [
            {
                author: { name: announcement.author.name, url: announcement.author.href },
                title: announcement.title,
                description: announcement.content,
                url: announcement.href,
                image: { url: announcement.imageUrl },
                footer: { text: `${announcement.date.replace(/-/g, ' ')} ${config.footer}` }
            }
        ]
    }

    // Στέλνουμε το webhook στο Discord
    try {
        await axios.post(config.webhookUrl, data);
    } catch (e) {
        console.error('Υπάρχει νέα ανακοίνωση , αλλά υπήρξε πρόβλημα στην αποστολή της στο Discord: ', e);
        return;
    }
}

// Αν είναι ενεργοποιημένο το initial, τρέξε την κύρια διαδικασία μία extra φορά στην αρχή
if (config.initial) main();

// Προγραμματίζουμε την κύρια διαδικασια να τρέχει όσο συχνά έχει οριστεί η ρύθμιση "cronString" στο config.json
// Αυτό επίσεις κρατάει το πρόγραμμα ζωντανό
cron.schedule(config.cronString, main);

// Inform the user
console.log(`Το πρόγραμμα τρέχει, θα κάνει έλεγχο: ${cronstrue.toString(config.cronString)}.`);