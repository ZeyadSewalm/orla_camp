/**
 * OrlaDent Camp — Google Drive STL bridge
 *
 * Deploy this Apps Script as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Run setupOrlaDrive() once before deployment. It creates:
 *   My Drive / OrlaDent Camp / Student Submissions
 * and prints the bridge secret that must be copied to Vercel.
 *
 * The website server authenticates the student with Supabase. This bridge
 * never trusts a student identity from the browser; it only accepts calls
 * protected by the shared secret stored in Script Properties.
 */

const ORLA_ROOT_NAME = 'OrlaDent Camp';
const ORLA_SUBMISSIONS_NAME = 'Student Submissions';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function setupOrlaDrive() {
  const props = PropertiesService.getScriptProperties();
  const root = getOrCreateChildFolder_(DriveApp.getRootFolder(), ORLA_ROOT_NAME);
  const submissions = getOrCreateChildFolder_(root, ORLA_SUBMISSIONS_NAME);

  let secret = props.getProperty('ORLA_BRIDGE_SECRET');
  if (!secret) {
    secret = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()]
      .join('')
      .replace(/-/g, '');
  }

  props.setProperties({
    ORLA_BRIDGE_SECRET: secret,
    ORLA_SUBMISSIONS_FOLDER_ID: submissions.getId()
  }, false);

  // Force the Drive + external request scopes to be authorized during setup.
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  console.log('OrlaDent Camp Drive bridge is ready.');
  console.log('Student Submissions folder ID: ' + submissions.getId());
  console.log('GOOGLE_APPS_SCRIPT_SECRET=' + secret);
  console.log('Next: Deploy > New deployment > Web app > Execute as Me > Anyone.');
  return { folderId: submissions.getId(), secret: secret };
}

function rotateOrlaBridgeSecret() {
  const secret = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()]
    .join('')
    .replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ORLA_BRIDGE_SECRET', secret);
  console.log('GOOGLE_APPS_SCRIPT_SECRET=' + secret);
  return secret;
}

function doGet() {
  return json_({ ok: true, service: 'OrlaDent Camp Drive Bridge' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertSecret_(payload.secret);

    switch (String(payload.action || '')) {
      case 'createUploadSession':
        return json_(createUploadSession_(payload));
      case 'verifyFile':
        return json_({ ok: true, file: verifyFile_(payload.fileId) });
      case 'findBySubmission':
        return json_({ ok: true, file: findBySubmission_(payload.submissionId) });
      case 'health':
        return json_({ ok: true, service: 'OrlaDent Camp Drive Bridge' });
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({
      ok: false,
      error: 'bridge_error',
      message: String(error && error.message ? error.message : error).slice(0, 500)
    });
  }
}

function createUploadSession_(payload) {
  const props = PropertiesService.getScriptProperties();
  const rootId = props.getProperty('ORLA_SUBMISSIONS_FOLDER_ID');
  if (!rootId) throw new Error('Run setupOrlaDrive() first.');

  const storedFilename = safeName_(payload.storedFilename, 'submission.stl');
  const stageName = safeName_(payload.stageName, 'Stage');
  const lessonName = safeName_(payload.lessonName, 'Lesson');
  const fileSize = Math.floor(Number(payload.fileSize));
  const contentType = String(payload.contentType || 'application/octet-stream').slice(0, 150);
  const submissionId = id_(payload.submissionId, 'submissionId');
  const assignmentId = id_(payload.assignmentId, 'assignmentId');
  const userId = id_(payload.userId, 'userId');

  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error('Invalid file size.');

  const root = DriveApp.getFolderById(rootId);
  const stageFolder = getOrCreateChildFolder_(root, stageName);
  const lessonFolder = getOrCreateChildFolder_(stageFolder, lessonName);

  const metadata = {
    name: storedFilename,
    parents: [lessonFolder.getId()],
    appProperties: {
      orla_submission_id: submissionId,
      orla_assignment_id: assignmentId,
      orla_user_id: userId
    }
  };

  const url = DRIVE_UPLOAD + '/files?uploadType=resumable&fields=id,name,size,webViewLink,parents,appProperties';
  const response = driveFetch_(url, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      'X-Upload-Content-Type': contentType,
      'X-Upload-Content-Length': String(fileSize)
    },
    payload: JSON.stringify(metadata),
    followRedirects: false
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Drive session failed (' + code + '): ' + response.getContentText().slice(0, 300));
  }

  const headers = response.getAllHeaders();
  const sessionUrl = headers.Location || headers.location;
  if (!sessionUrl) throw new Error('Drive did not return a resumable session URL.');

  return {
    ok: true,
    sessionUrl: String(sessionUrl),
    folderId: lessonFolder.getId()
  };
}

function verifyFile_(fileId) {
  const id = id_(fileId, 'fileId');
  const fields = 'id,name,size,parents,webViewLink,appProperties,trashed';
  const response = driveFetch_(DRIVE_API + '/files/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(fields), {
    method: 'get'
  });
  const code = response.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) {
    throw new Error('Drive verify failed (' + code + '): ' + response.getContentText().slice(0, 300));
  }
  return JSON.parse(response.getContentText());
}

function findBySubmission_(submissionId) {
  const id = id_(submissionId, 'submissionId');
  const escaped = escapeDriveQuery_(id);
  const q = "appProperties has { key='orla_submission_id' and value='" + escaped + "' } and trashed = false";
  const fields = 'files(id,name,size,parents,webViewLink,appProperties,trashed)';
  const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(fields) + '&pageSize=10&spaces=drive';
  const response = driveFetch_(url, { method: 'get' });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Drive lookup failed (' + code + '): ' + response.getContentText().slice(0, 300));
  }
  const data = JSON.parse(response.getContentText());
  return data.files && data.files.length ? data.files[0] : null;
}

function driveFetch_(url, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers || {}, {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  });
  opts.muteHttpExceptions = true;
  return UrlFetchApp.fetch(url, opts);
}

function getOrCreateChildFolder_(parent, name) {
  const safe = safeName_(name, 'Folder');
  const folders = parent.getFoldersByName(safe);
  return folders.hasNext() ? folders.next() : parent.createFolder(safe);
}

function assertSecret_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ORLA_BRIDGE_SECRET');
  if (!expected) throw new Error('Run setupOrlaDrive() first.');
  if (!provided || String(provided) !== expected) throw new Error('Unauthorized bridge request.');
}

function id_(value, label) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(text)) throw new Error('Invalid ' + label + '.');
  return text;
}

function safeName_(value, fallback) {
  const text = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || fallback || 'file').slice(0, 150);
}

function escapeDriveQuery_(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
