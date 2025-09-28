import { Vimeo } from '@vimeo/vimeo';

const CLIENT_VIMEO = new Vimeo(process.env.VIMEO_CLIENT_ID, process.env.VIMEO_CLIENT_SECRET, process.env.VIMEO_TOKEN);

export async function UploadVideoVimeo(PathFile, VideoMetaDato) {
    return new Promise((resolve,reject) => {
        CLIENT_VIMEO.upload(
            PathFile,
            VideoMetaDato,
            function (url) {
                resolve({
                    message: 200,
                    value: url,
                });
            },
            function (bytesUploaded, bytesTotal) {
                const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
            },
            function (err) {
                console.log("Error al subir el video: ",err);
                reject({
                    message: 403,
                    message_text: "ERROR AL SUBIR EL VIDEO A VIMEO"
                });
            },
        )
    })
}
