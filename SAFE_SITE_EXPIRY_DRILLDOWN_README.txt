SAFE SITE - EXPIRY DRILLDOWN UPDATE

1. Upload expiry-drilldown.js to the ROOT of the Safe-Site GitHub repository.
2. Edit index.html near the bottom where the other script tags are.
3. Immediately after the expiry-intelligence.js script line, add:

<script src="expiry-drilldown.js?v=20260910a"></script>

4. Commit the changes.
5. Wait about one minute for Vercel.
6. Open Safe Site and refresh.
7. On Home, tap one of the Training Expiry Alert boxes.
8. Affected workers will appear. Tap a worker to open their Worker Passport.

No existing Safe Site file needs to be replaced for this update.
