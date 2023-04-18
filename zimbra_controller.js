var express = require("express");
var router = express.Router();
var axios = require("axios");
var https = require("https");
var FormData = require("form-data");
const fs = require("fs");
const path = require("path");
var atob = require("atob");
const Jimp = require("jimp");
const MailComposer = require("nodemailer/lib/mail-composer");
var Blob = require("blob");
const zimbra = require("../../../utils/zimbra-client");
const { type } = require("os");

let welcome = async (req, res) => {
  return res.status(200).json({
    ok: true,
    message: "Bienvenido",
  });
};

let send = async (req, res) => {
  let response = "";
  let searchReqObj = {};
  let e = [];

  console.log("----- Entra en send microservicio -----");

  const {
    clientId,
    clientSecret,
    redirectUri,
    refreshToken,
    subject,
    from,
    to,
    msg,
    attachs,
    cc,
    cco,
    reply,
    inreplyTo,
    threadId,
    file,
  } = req.body;
  const login = await zimbra.getUserAuthToken(
    redirectUri,
    clientId,
    clientSecret,
    function (err, authToken) {
      if (err != null) {
        return res.status(500).json({
          ok: false,
          message: "Credenciales Invalidas",
        });
      }

      if (to) {
        e.push({ "@": { a: to, t: "t" } });
      }
      if (cc) {
        e.push({ "@": { a: cc, t: "c" } });
      }
      if (cco) {
        e.push({ "@": { a: cco, t: "b" } });
      }
      if (attachs) {
        response = "SaveDraftResponse";
        searchReqObj = _createSaveDraftRequest(
          from,
          null,
          subject,
          msg,
          e,
          null
        );
        let strAttachs = [];
        let parts = [];
        zimbra.sendMessage(
          redirectUri,
          authToken,
          searchReqObj,
          response,
          "",
          async function (error, success) {
            if (error != null) {
              return res.status(500).json({
                success: false,
                message: "Error en el envio del correo",
              });
            }

            for (var ia = 0; ia < attachs.length; ia++) {
              const buffer = Buffer.from(attachs[ia].content, "base64");
              const form = new FormData();
              form.append("file", buffer, attachs[ia].filename);

              const agent = new https.Agent({
                rejectUnauthorized: false,
              });
              var config = {
                headers: {
                  Cookie: `ZM_TEST=true; ZM_AUTH_TOKEN=${authToken}`,
                  ...form.getHeaders(),
                },
                httpsAgent: agent,
              };
              await axios
                .post(
                  `https://${redirectUri}/service/upload?fmt=extended,raw`,
                  form,
                  config
                )
                .then(function (response) {
                  let objeto = {
                    status: response.data.split("',")[0],
                    body: response.data.split("',")[1],
                  };
                  if (objeto.status.split(",")[0] == 200) {
                    strAttachs.push(JSON.parse(objeto.body)[0].aid);
                    parts.push({ mid: success.m[0].id, part: ia + 2 });
                  }
                })
                .catch(function (error) {
                  return res.status(500).json({
                    success: false,
                    message: "Error al subir adjuntos",
                  });
                });
            }
            responseNew = "SaveDraftResponse";
            searchReqObj = _createSaveDraftRequest(
              from,
              strAttachs.toString(),
              subject,
              msg,
              e,
              success.m[0].id
            );

            zimbra.sendMessage(
              redirectUri,
              authToken,
              searchReqObj,
              response,
              "",
              async function (er, su) {
                if (er != null) {
                  return res.status(500).json({
                    success: false,
                    message: "Error en el envio del correo",
                  });
                }

                responseNew = "SendMsgResponse";
                searchReqObj = _createSendRequest(
                  parts,
                  subject,
                  msg,
                  e,
                  su.m[0].id
                );

                zimbra.sendMessage(
                  redirectUri,
                  authToken,
                  searchReqObj,
                  responseNew,
                  "",
                  async function (err, suc) {
                    if (err != null) {
                      return res.status(500).json({
                        success: false,
                        message: "Error en el envio del correo",
                      });
                    }

                    let result = await getMessages(
                      redirectUri,
                      authToken,
                      suc.m,
                      res,
                      false
                    );
                  }
                );
              }
            );
          }
        );
      } else {
        response = "SendMsgResponse";
        searchReqObj = _createSendRequest(null, subject, msg, e, null);

        zimbra.sendMessage(
          redirectUri,
          authToken,
          searchReqObj,
          response,
          "",
          async function (error, success) {
            if (error != null) {
              return res.status(500).json({
                success: false,
                message: "Error en el envio del correo",
              });
            }
            let result = await getMessages(
              redirectUri,
              authToken,
              success.m,
              res,
              false
            );
          }
        );
      }
    }
  );
};

function _createSaveDraftRequest(from, attachs, subject, msg, e, id) {
  let request = {};

  if (attachs) {
    request = {
      SaveDraftRequest: {
        m: {
          e: e,
          id: id,
          attach: {
            aid: attachs,
          },
          su: subject,
          mp: {
            "@": { ct: "text/html" },
            content: msg,
          },
        },
        "@": { xmlns: "urn:zimbraMail" },
      },
    };
  } else {
    request = {
      SaveDraftRequest: {
        m: {
          e: e, // "attach": {
          //     "aid": "94b3e068-b750-4abc-847f-f5c6f3788ac0:84f95cb0-4395-4b69-b2c8-766f31796113"
          // },
          su: subject,
          mp: {
            "@": { ct: "text/html" },
            content: msg,
          },
        },
        "@": { xmlns: "urn:zimbraMail" },
      },
    };
  }

  return request;
}

function _createSendRequest(attachs, subject, msg, e, id) {
  let objeto = {};

  if (attachs) {
    objeto = {
      SendMsgRequest: {
        m: {
          e: e,
          attach: {
            mp: attachs,
          },
          id: id,
          su: subject,
          mp: {
            "@": { ct: "text/html" },
            content: msg,
          },
        },
        "@": { xmlns: "urn:zimbraMail" },
      },
    };
  } else {
    objeto = {
      SendMsgRequest: {
        m: {
          e: e,
          su: subject,
          mp: {
            "@": { ct: "text/html" },
            content: msg,
          },
        },
        "@": { xmlns: "urn:zimbraMail" },
      },
    };
  }
  return objeto;
}

async function getMessages(redirectUri, authToken, ids, res, isparts) {
  var arreglo = [];
  var respEmail = {};

  try {
    if (ids) {
      for (var i = 0; i < ids.length; i++) {
        await zimbra.getMessage(
          redirectUri,
          authToken,
          ids[i].id,
          async function (fail, done) {
            if (fail != null) {
              return res.status(500).json({
                success: false,
                message: "Error al obtener el correo",
              });
            }

            let date = new Date(done.m[0].d);
            respEmail.id = done.m[0].id;
            respEmail.cid = done.m[0].cid;

            respEmail.date =
              date.toDateString() +
              " " +
              date.getHours() +
              ":" +
              date.getMinutes() +
              ":" +
              date.getSeconds();
            respEmail.replyto = done.m[0].mid;
            respEmail.subject = done.m[0].su;
            respEmail.from = done.m[0].e[0].a;
            respEmail.to = done.m[0].e[1].a;
            respEmail.name = done.m[0].e[0].p;
            respEmail.nameTo = done.m[0].e[1].p;
            respEmail.email = done.m[0].e[0].a;
            respEmail.emailTo = done.m[0].e[1].a;
            respEmail.emailType = "zimbra";
            if (respEmail.name == "") {
              respEmail.name = email.split("@")[0];
            }
            respEmail.msg = await getContentMsg(
              done.m[0].mp,
              redirectUri,
              done.m[0].id,
              authToken
            );

            arreglo.push(respEmail);
            if (arreglo.length == ids.length) {
              if (isparts) {
                //console.log(arreglo);
                //console.log(arreglo[0].msg);
                data = { success: "true", messageAdded: arreglo };

                console.log(
                  `${process.env.DASHBOARD}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`
                );
                //console.log(`${process.env.DASHBOARDZIMBRA}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`, data);
                axios
                  .post(
                    `${process.env.DASHBOARD}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`,
                    data
                  )
                  .then((success) => {
                    console.log(`Zimbra: ${success.status} `);
                    return res.status(200).json({
                      success: true,
                      message: "Todo Bien",
                    });
                  })
                  .catch((error) => {
                    //console.log(`Zimbra: ${error.response.status} `);
                    console.log(`Zimbra: ${error} `);
                    /*return res.status(500).json({
                                                            success: false, message: 'Todo Mal'
                                                        })*/
                  });
              } else {
                return res.status(200).json({
                  success: true,
                  newMessage: arreglo,
                });
              }
            }
          }
        );
      }
    } else {
      // console.log('No hay nuevos correos');
    }
  } catch (e) {
    // console.log(e);
    console.log("ZIMBRA ERROR");
  }
}

async function getContentMsg(parts, redirectUri, id, token) {
  var encodedBody;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].ct == "text/html" || parts[i].ct == "text/plain") {
      encodedBody = [
        {
          attach: Buffer.from(parts[i].content).toString("base64"),
          type: "text/html",
        },
      ];
    } else {
      if(parts[i].mp){
        encodedBody = await getHTMLPart(parts[i].mp, redirectUri, id, token);
      }
      
    }
  }
  return encodedBody;
}

async function getHTMLPart(arr, host, id, token) {
  var attachs = [];
  for (var x = 0; x <= arr.length; x++) {
    if (typeof arr[x] != "undefined") {
      // console.log(arr[x].ct);
      if (arr[x].ct === "text/plain") {
        if (arr[x].hasOwnProperty("content")) {
          objeto = {
            attach: Buffer.from(arr[x].content).toString("base64"),
            type: arr[x].ct,
          };
          attachs.push(objeto);
        }
      }
      if (arr[x].ct === "text/html") {
        image = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: image, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (arr[x].ct === "text/csv") {
        csv = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: csv, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        excel = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: excel, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        excel = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: excel, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        excel = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: excel, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct === "image/jpeg" ||
        arr[x].ct === "image/png" ||
        arr[x].ct === "image/gif"
      ) {
        image = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: image, type: arr[x].ct };
        attachs.push(objeto);
      }

      if (arr[x].ct === "video/mp4") {
        video = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: video, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct === "audio/wav" ||
        arr[x].ct === "audio/mp3" ||
        arr[x].ct === "audio/mpeg"
      ) {
        audio = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: audio, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (arr[x].ct === "application/pdf") {
        pdf = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: pdf, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (arr[x].ct === "application/zip") {
        zip = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: zip, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (
        arr[x].ct === "application/x-rar-compressed" ||
        arr[x].ct === "application/x-rar"
      ) {
        rar = await getAttachments(host, id, arr[x].part, token);
        objeto = { attach: rar, type: arr[x].ct };
        attachs.push(objeto);
      }
      if (arr[x].ct === "multipart/alternative") {
        data = await getHTMLPart(arr[x].mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }
      if (arr[x].ct === "multipart/mixed") {
        data = await getHTMLPart(arr[x].mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }

      if (arr[x].ct === "multipart/related" ) {
        data = await getHTMLPart(arr[x].mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }
    }
  }
  return attachs;
}

async function getAttachments(host, id, part, token) {
  try {
    if (host && id && part && token) {
      let attach = null;
      const agent = new https.Agent({
        rejectUnauthorized: false,
      });
      await axios
        .get(`https://${host}/service/content/get?id=${id}&part=${part}`, {
          httpsAgent: agent,
          headers: { Cookie: `ZM_AUTH_TOKEN=${token};` },
          responseType: "arraybuffer",
        })
        .then((response) => {
          attach = Buffer.from(response.data, "binary").toString("base64");
        });
      return attach;
    } else {
      console.log("NO HAY ARCHIVOS ADJUNTOS");
    }
  } catch (e) {
    console.log("ZIMBRA-ERROR-ADJUNTOS");
  }
}

/*
const getAttachments = async (host, id, part, token) => {
    try {
        const agent = new https.Agent({
            rejectUnauthorized: false,
        });

        const resp = await axios
        .get(`https://${host}/service/content/get?id=${id}&part=${part}`, {
          httpsAgent: agent,
          headers: { Cookie: `ZM_AUTH_TOKEN=${token};` },
          responseType: "arraybuffer",
        });
        console.log("🚀 ~ file: zimbra_controller.js:559 ~ getAttachments ~ resp:", resp)
        attach = Buffer.from(response.data, "binary").toString("base64");
        return attach;
    } catch (err) {
        // Handle Error Here
        console.error(err);
    }
};
*/
let read = async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;

  try {
    const login = await zimbra.getUserAuthToken(
      redirectUri,
      clientId,
      clientSecret,
      async function (err, authToken) {
        if (err != null) {
          return res.status(500).json({
            ok: false,
            message: "Credenciales Invalidas",
            err: err,
          });
        }
        //console.log(authToken);
        //console.log(redirectUri);
        await zimbra.getUnreadMails(
          redirectUri,
          authToken,
          12,
          async function (error, success) {
            //console.log("🚀 ~ file: zimbra_controller.js:573 ~ success:", success.m)
            if (error != null) {
              return res.status(500).json({
                ok: false,
                message: "Error al obtener los correos",
                err: error,
              });
            }
            //console.log(success.m);
            let result = await getMessagesHistory(
              redirectUri,
              clientId,
              authToken,
              success.m,
              res
            );
          }
        );
      }
    );
  } catch (e) {
    // console.log(e)
  }
};

async function getMessagesHistory(redirectUri, clientId, authToken, ids, res) {
  try {
    if (ids) {
      let objArray = [];
      ids.forEach(async (data) => {
        //console.log("🚀 ~ file: zimbra_controller.js:600 ~ ids.forEach ~ data", data)
        let objTem = {};
        await zimbra.getMessage(
          redirectUri,
          authToken,
          data.id,
          async function (fail, done) {
            //console.log("🚀 ~ file: zimbra_controller.js:609 ~ done:", done)

            const { m } = done;
            const [dataM] = m;
            const { e } = dataM;
            //console.log("🚀 ~ file: zimbra_controller.js:614 ~ dataM:", dataM)
            const [eDataCero, eDataUno] = e;
            //console.log("🚀 ~ file: zimbra_controller.js:640 ~ e:", e)
            //console.log("🚀 ~ file: zimbra_controller.js:640 ~ eDataUno:", eDataUno)
            const emailFromTmp = [...e];
            let emailCC = "";
            let emailFrom = "";
            let emailTmp = "";
            let emailTo = "";
            let emailToOtres = "";
            let emailToName = "";
            emailFromTmp.forEach((dataMails) => {
              let { a, t, p } = dataMails;
              if (t === "t" && a.search(clientId) != -1) {
                emailTo = a;
                emailToName = p;
              } else if (t === "t" && a.search(clientId) === -1) {
                emailToOtres += `${a};`;
              } else {
                if (t === "c") {
                  emailCC += `${a};`;
                }
              }
            });
            let date = new Date(dataM.d);
            //let msg= [];
            let msg = await getContentMsg(
              dataM.mp,
              redirectUri,
              dataM.id,
              authToken
            );

            objTem = {
              id: dataM.id,
              cid: dataM.cid,
              date:
                date.toDateString() +
                " " +
                date.getHours() +
                ":" +
                date.getMinutes() +
                ":" +
                date.getSeconds(),
              replyto: dataM.mid,
              subject: dataM.su,
              from: eDataCero.a,
              to: emailTo,
              name: eDataCero.p != "" ? eDataCero.a.split("@")[0] : eDataCero.p,
              nameTo: emailToName,
              email: emailTmp,
              toOthers: emailToOtres,
              cc: emailCC,
              emailType: "zimbra",
              msg: msg ? msg : [],
            };
            objArray.push(objTem);
            if (objArray.length == ids.length) {
              data = { success: "true", messageAdded: objArray };
              axios
                .post(
                  `${process.env.DASHBOARD}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`,
                  data
                )
                .then((success) => {
                  console.log(`Zimbra: ${success.status} `);
                  return res.status(200).json({
                    success: true,
                    message: "Todo Bien",
                    messageAdded: objArray,
                  });
                })
                .catch((error) => {
                  console.log(`Zimbra: ${error} `);
                });
            }
          }
        );
      });
      //console.log("🚀 ~ file: zimbra_controller.js:649 ~ arregloTmp=awaitids.map ~ arregloTmp", arregloTmp)
    } else {
      console.log("No hay nuevos correos");
    }
  } catch (e) {
    console.log(e);
    console.log("ZIMBRA ERROR");
  }
}

let readprueba = async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;

  try {
    const login = await zimbra.getUserAuthToken(
      redirectUri,
      clientId,
      clientSecret,
      async function (err, authToken) {
        if (err != null) {
          return res.status(500).json({
            ok: false,
            message: "Credenciales Invalidas",
            err: err,
          });
        }
        //console.log(authToken);
        //console.log(redirectUri);
        await zimbra.getUnreadMails(
          redirectUri,
          authToken,
          30,
          async function (error, success) {
            //console.log("🚀 ~ file: zimbra_controller.js:573 ~ success:", success.m)
            if (error != null) {
              return res.status(500).json({
                ok: false,
                message: "Error al obtener los correos",
                err: error,
              });
            }
            //console.log(success.m);
            let result = await getMessagesHistoryPrueba(
              redirectUri,
              clientId,
              authToken,
              success.m,
              res
            );
          }
        );
      }
    );
  } catch (e) {
    // console.log(e)
  }
};

async function getMessagesHistoryPrueba(
  redirectUri,
  clientId,
  authToken,
  ids,
  res
) {
  try {
    if (ids) {
      let objArray = [];
      ids.forEach(async (data) => {
        //console.log("🚀 ~ file: zimbra_controller.js:600 ~ ids.forEach ~ data", data)
        let objTem = {};
        await zimbra.getMessage(
          redirectUri,
          authToken,
          data.id,
          async function (fail, done) {
            //console.log("🚀 ~ file: zimbra_controller.js:609 ~ done:", done)

            const { m } = done;
            const [dataM] = m;
            const { e } = dataM;
            //console.log("🚀 ~ file: zimbra_controller.js:614 ~ dataM:", dataM)
            const [eDataCero, eDataUno] = e;
            //console.log("🚀 ~ file: zimbra_controller.js:640 ~ e:", e)
            //console.log("🚀 ~ file: zimbra_controller.js:640 ~ eDataUno:", eDataUno)
            const emailFromTmp = [...e];
            let emailCC = "";
            let emailFrom = "";
            let emailTmp = "";
            let emailTo = "";
            let emailToOtres = "";
            let emailToName = "";
            emailFromTmp.forEach((dataMails) => {
              let { a, t, p } = dataMails;
              if (t === "t" && a.search(clientId) != -1) {
                emailTo = a;
                emailToName = p;
              } else if (t === "t" && a.search(clientId) === -1) {
                emailToOtres += `${a};`;
              } else {
                if (t === "c") {
                  emailCC += `${a};`;
                }
              }
            });
            let date = new Date(dataM.d);
            let msg = [];
            /*let msg = await getContentMsg(
              dataM.mp,
              redirectUri,
              dataM.id,
              authToken
            );*/

            objTem = {
              id: dataM.id,
              cid: dataM.cid,
              date:
                date.toDateString() +
                " " +
                date.getHours() +
                ":" +
                date.getMinutes() +
                ":" +
                date.getSeconds(),
              replyto: dataM.mid,
              subject: dataM.su,
              from: eDataCero.a,
              to: emailTo,
              name: eDataCero.p != "" ? eDataCero.a.split("@")[0] : eDataCero.p,
              nameTo: emailToName,
              email: emailTmp,
              toOthers: emailToOtres,
              cc: emailCC,
              emailTo: emailFrom,
              emailType: "zimbra",
              msg: msg ? msg : [],
            };
            objArray.push(objTem);
            if (objArray.length == ids.length) {
              data = { success: "true", messageAdded: objArray };
              return res.status(200).json({
                success: true,
                message: "Todo Bien",
                messageAdded: objArray,
              });
              /*axios
                .post(
                  `${process.env.DASHBOARD}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`,
                  data
                )
                .then((success) => {
                  console.log(`Zimbra: ${success.status} `);
                  return res.status(200).json({
                    success: true,
                    message: "Todo Bien",
                    messageAdded: objArray,
                  });
                })
                .catch((error) => {
                  console.log(`Zimbra: ${error} `);
                });*/
            }
          }
        );
      });
      //console.log("🚀 ~ file: zimbra_controller.js:649 ~ arregloTmp=awaitids.map ~ arregloTmp", arregloTmp)
    } else {
      console.log("No hay nuevos correos");
    }
  } catch (e) {
    console.log(e);
    console.log("ZIMBRA ERROR");
  }
}

async function getContentMsgPruebas(parts, redirectUri, id, token) {
  var encodedBody;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].ct == "text/html" || parts[i].ct == "text/plain") {
      encodedBody = [
        {
          attach: Buffer.from(parts[i].content).toString("base64"),
          type: "text/html",
        },
      ];
    } else {
      encodedBody = await getHTMLPartPruebas(parts[i].mp, redirectUri, id, token);
    }
  }
  return encodedBody;
}

async function getHTMLPartPruebas(arr, host, id, token) {
  var attachs = [];

  arr.forEach(async (element) => {
    if (typeof element != "undefined") {
      let {ct , part, mp } = element;
      // console.log(ct);
      if (ct === "text/plain") {
        if (hasOwnProperty("content")) {
          objeto = {
            attach: Buffer.from(content).toString("base64"),
            type: ct,
          };
          attachs.push(objeto);
        }
      }
      if (ct === "text/html") {
        image = await getAttachments(host, id, part, token);
        objeto = { attach: image, type: ct };
        attachs.push(objeto);
      }
      if (ct === "text/csv") {
        csv = await getAttachments(host, id, part, token);
        objeto = { attach: csv, type: ct };
        attachs.push(objeto);
      }
      if (
        ct ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        excel = await getAttachments(host, id, part, token);
        objeto = { attach: excel, type: ct };
        attachs.push(objeto);
      }
      if (
        ct ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        excel = await getAttachments(host, id, part, token);
        objeto = { attach: excel, type: ct };
        attachs.push(objeto);
      }
      if (
        ct ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        excel = await getAttachments(host, id, part, token);
        objeto = { attach: excel, type: ct };
        attachs.push(objeto);
      }
      if (
        ct === "image/jpeg" ||
        ct === "image/png" ||
        ct === "image/gif"
      ) {
        image = await getAttachments(host, id, part, token);
        objeto = { attach: image, type: ct };
        attachs.push(objeto);
      }

      if (ct === "video/mp4") {
        video = await getAttachments(host, id, part, token);
        objeto = { attach: video, type: ct };
        attachs.push(objeto);
      }
      if (
        ct === "audio/wav" ||
        ct === "audio/mp3" ||
        ct === "audio/mpeg"
      ) {
        audio = await getAttachments(host, id, part, token);
        objeto = { attach: audio, type: ct };
        attachs.push(objeto);
      }
      if (ct === "application/pdf") {
        pdf = await getAttachments(host, id, part, token);
        objeto = { attach: pdf, type: ct };
        attachs.push(objeto);
      }
      if (ct === "application/zip") {
        zip = await getAttachments(host, id, part, token);
        objeto = { attach: zip, type: ct };
        attachs.push(objeto);
      }
      if (
        ct === "application/x-rar-compressed" ||
        ct === "application/x-rar"
      ) {
        rar = await getAttachments(host, id, part, token);
        objeto = { attach: rar, type: ct };
        attachs.push(objeto);
      }
      if (ct === "multipart/alternative") {
        data = await getHTMLPart(mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }
      if (ct === "multipart/mixed") {
        data = await getHTMLPart(mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }

      if (ct === "multipart/related" ) {
        data = await getHTMLPart(mp, host, id, token);
        for (var i = 0; i < data.length; i++) {
          attachs.push(data[i]);
        }
      }
    }
  });
  return attachs;
}

/*Metodo para leer el correo por id*/
let readMsg = async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;

  try {
    let objArray = [];
    const login = await zimbra.getUserAuthToken(
      redirectUri,
      clientId,
      clientSecret,
      async function (err, authToken) {
        if (err != null) {
          return res.status(500).json({
            ok: false,
            message: "Credenciales Invalidas",
            err: err,
          });
        }

        await zimbra.getMessage(
          redirectUri,
          authToken,
          req.params.mailid,
          async function (fail, done) {
            if (fail != null) {
              return res.status(500).json({
                success: false,
                message: "Error al obtener el correo",
              });
            }
            const { m } = done;
            const [dataM] = m;
            const { e } = dataM;
            const [eDataCero, eDataUno] = e;
            const emailFromTmp = [...e];
            let emailCC = "";
            let emailFrom = "";
            let emailTmp = "";
            let emailTo = "";
            let emailToOtres = "";
            let emailToName = "";
            emailFromTmp.forEach((dataMails) => {
              let { a, t, p } = dataMails;
              if (t === "t" && a.search(clientId) != -1) {
                emailTo = a;
                emailToName = p;
              } else if (t === "t" && a.search(clientId) === -1) {
                emailToOtres += `${a};`;
              } else {
                if (t === "c") {
                  emailCC += `${a};`;
                }
              }
            });
            let date = new Date(dataM.d);
            //let msg = [];
            let msg = await getContentMsgPruebas(
              dataM.mp,
              redirectUri,
              dataM.id,
              authToken
            );

            objTem = {
              id: dataM.id,
              cid: dataM.cid,
              date:
                date.toDateString() +
                " " +
                date.getHours() +
                ":" +
                date.getMinutes() +
                ":" +
                date.getSeconds(),
              replyto: dataM.mid,
              subject: dataM.su,
              from: eDataCero.a,
              to: emailTo,
              name: eDataCero.p != "" ? eDataCero.a.split("@")[0] : eDataCero.p,
              nameTo: emailToName,
              email: emailTmp,
              toOthers: emailToOtres,
              cc: emailCC,
              emailTo: emailFrom,
              emailType: "zimbra",
              msg: msg ? msg : [],
            };
            objArray.push(objTem);
            data = { success: "true", messageAdded: objArray };
            let url = `${process.env.DASHBOARD}/${process.env.DASHBOARDNAMECLIENT}/gmailapi/`;           
            console.log("🚀 ~ file: zimbra_controller.js:1117 ~ url:", url);
            
            axios
              .post(
                url,
                data
              )
              .then((success) => {
                //console.log(`Zimbra: ${success.status} `);
                return res.status(200).json({
                  success: true,
                  message: "Todo Bien",
                  messageAdded: objArray,
                });
              })
              .catch((error) => {
                //console.log(`Zimbra: ${error} `);
                return res.status(200).json({
                  success: true,
                  message: "Todo Bien",
                  error: error,
                });
              });
          }
        );
      }
    );
  } catch (e) {
    // console.log(e)
  }
};

/*Metodo para cambiar el estado del correo*/
let unreadstatus = async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;

  try {
    const login = await zimbra.getUserAuthToken(
      redirectUri,
      clientId,
      clientSecret,
      async function (err, authToken) {
        if (err != null) {
          return res.status(500).json({
            ok: false,
            message: "Credenciales Invalidas",
            err: err,
          });
        }

        await zimbra.getUnreadMail(
          redirectUri,
          authToken,
          req.params.mailid,
          async function (fail, done) {
            if (fail != null) {
              return res.status(500).json({
                success: false,
                message: "Error al obtener el correo",
              });
            }
            const { m } = done;
            const [dataM] = m;
            return res.status(200).json({
              success: true,
              message: "Ok !",
              emailid: dataM.cid,
            });
          }
        );
      }
    );
  } catch (e) {
    // console.log(e)
  }
};

module.exports = {
  welcome,
  send,
  read,
  readprueba,
  readMsg,
  unreadstatus,
};
