// api/lib/google.js
// Client d'authentification partagé (compte de service) pour Sheets + Drive.
//
// Variables d'environnement Vercel nécessaires (Project Settings > Environment Variables) :
//   GOOGLE_SERVICE_ACCOUNT_EMAIL = cahier-de-classe-bot@cahier-de-classe-bot.iam.gserviceaccount.com
//   GOOGLE_PRIVATE_KEY           = le champ "private_key" du fichier JSON, TEL QUEL (avec les \n)
//   SHEET_ID                     = l'ID de "App Cahier de classe - CP (données)"
//                                  (dans son URL : /spreadsheets/d/<SHEET_ID>/edit)
//   PHOTOS_FOLDER_ID             = l'ID du dossier Drive "Observations — Photos"
//                                  (dans son URL : /drive/folders/<PHOTOS_FOLDER_ID>)

const { google } = require('googleapis');

function getAuth(){
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key){
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL ou GOOGLE_PRIVATE_KEY manquant dans les variables d'environnement Vercel.");
  }
  // Sur Vercel, les retours à la ligne du champ private_key arrivent souvent sous forme
  // littérale "\n" (deux caractères) plutôt qu'un vrai saut de ligne : on les reconvertit.
  key = key.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });
}

function getSheetsClient(){
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDriveClient(){
  return google.drive({ version: 'v3', auth: getAuth() });
}

module.exports = { getAuth, getSheetsClient, getDriveClient };
