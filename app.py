import csv, io, threading, webbrowser
from flask import Flask, request, jsonify, render_template, Response
from audit import audit, DEFAULT_FOLDER

app=Flask(__name__)
@app.get('/')
def index(): return render_template('index.html',folder=DEFAULT_FOLDER)
@app.post('/api/audit')
def run():
    try: return jsonify(audit((request.get_json() or {}).get('folder',DEFAULT_FOLDER)))
    except ValueError as e: return jsonify(error=str(e)),400
    except Exception: app.logger.exception('Audit failed'); return jsonify(error='Audit failed. See the app console for details.'),500
@app.post('/api/export')
def export():
    rows=(request.get_json() or {}).get('issues',[])
    out=io.StringIO(); fields=['level','rule','file','sheet','cell','employee','detail']; writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader()
    for row in rows:
        writer.writerow({k:("'"+str(row.get(k,'')) if str(row.get(k,'')).startswith(('=','+','-','@','\t','\r')) else row.get(k,'')) for k in fields})
    return Response('\ufeff'+out.getvalue(),mimetype='text/csv',headers={'Content-Disposition':'attachment; filename=PBB-preaudit.csv'})
if __name__=='__main__':
    threading.Timer(1.2,lambda:webbrowser.open('http://127.0.0.1:8765')).start()
    app.run(host='127.0.0.1',port=8765,debug=False)
