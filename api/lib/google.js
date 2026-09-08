// api/lib/google.js
// Client d'authentification partagé (compte de service) pour Sheets + Drive.
//
// Variable d'environnement Vercel nécessaire (Project Settings > Environment Variables) :
//   GOOGLE_SERVICE_ACCOUNT_JSON = le CONTENU COMPLET du fichier .json téléchargé
//                                 (ouvre le fichier, sélectionne tout, colle tel quel,
//                                  accolades comprises — pas besoin de retoucher les \n)
//   SHEET_ID                    = l'ID de "App Cahier de classe - CP (données)"
//                                 (dans son URL : /spreadsheets/d/<SHEET_ID>/edit)
//   PHOTOS_FOLDER_ID            = l'ID du dossier Drive "Observations — Photos"
//                                 (dans son URL : /drive/folders/<PHOTOS_FOLDER_ID>)

const { google } = require('googleapis');

function getServiceAccountCredentials(){
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw){
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON n'est pas configuré dans les variables d'environnement Vercel.");
  }
  let creds;
  try{
    creds = JSON.parse(raw);
  }catch(e){
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON n'est pas un JSON valide : as-tu bien collé tout le contenu du fichier .json, accolades { } comprises ?");
  }
  if (!creds.client_email || !creds.private_key){
    throw new Error("Le JSON collé ne contient pas client_email / private_key : vérifie que c'est bien le fichier de clé du compte de service.");
  }
  return creds;
}

function getAuth(){
  const creds = getServiceAccountCredentials();
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
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
