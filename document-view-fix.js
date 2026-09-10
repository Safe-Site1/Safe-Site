/* Safe Site - Mobile Secure Document View Fix */
(function () {
  'use strict';

  window.openWorkerDocument = async function (documentId) {
    // Open the tab immediately from the user's tap so mobile browsers
    // do not block it after the cloud request finishes.
    const viewer = window.open('', '_blank');

    if (viewer) {
      viewer.document.write(
        '<html><body style="background:#07131a;color:white;font-family:Arial;padding:30px;text-align:center;">' +
        '<h2>Safe Site</h2><p>Opening secure document...</p>' +
        '</body></html>'
      );
    }

    try {
      const client = initSupabase();

      const { data: row, error } = await client
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      const { data, error: storageError } = await client.storage
        .from('worker-documents')
        .createSignedUrl(row.storage_path, 120);

      if (storageError) throw storageError;

      if (viewer) {
        viewer.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }

    } catch (error) {
      console.error(error);

      if (viewer) viewer.close();

      if (typeof toast === 'function') {
        toast('Document could not be opened');
      }
    }
  };
})();
