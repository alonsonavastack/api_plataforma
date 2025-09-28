import models from "../models/index.js";
import getVideoDurationInSeconds from "get-video-duration";
import { UploadVideoVimeo } from "../utils/vimeo.js";
import mongoose from "mongoose";

import fs from "fs";
import path from "path";

function formatarDuracion(durationInSeconds) {
  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = Math.floor(durationInSeconds % 60);

  const formattedHours = String(hours).padStart(2, "0"); //1 2 3 "03" "03:04:05"
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(seconds).padStart(2, "0");

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}
//   00:00:00
// 25 segundos
export default {
  register: async (req, res) => {
    try {
      // course 1
      // desarrollo del backend
      // course 2
      // desarrollo del backend
      const VALID_CLASE = await models.CourseClase.findOne({
        title: req.body.title,
        section: req.body.section,
      });
      if (VALID_CLASE) {
        res.status(200).json({
          message: 403,
          message_text: "LA CLASE YA EXISTE",
        });
        return;
      }

      const NewClase = await models.CourseClase.create(req.body);

      res.status(200).json({
        clase: NewClase,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Hubo un error",
      });
    }
  },
  update: async (req, res) => {
    try {
      // course 1
      // desarrollo del backend
      // course 2
      // desarrollo del backend
      // STATUS
      const VALID_CLASE = await models.CourseClase.findOne({
        title: req.body.title,
        section: req.body.section,
        _id: { $ne: req.body._id },
      });
      if (VALID_CLASE) {
        res.status(200).json({
          message: 403,
          message_text: "LA CLASE YA EXISTE",
        });
        return;
      }

      const NEditCourseClase = await models.CourseClase.findByIdAndUpdate(
        { _id: req.body._id },
        req.body,
        { new: true }
      ); // { new: true } devuelve el documento actualizado

      res.status(200).json({
        clase: NEditCourseClase,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Hubo un error",
      });
    }
  },
  // GET /course_clase/list?section_id=<ObjectId>
  list: async (req, res) => {
    try {
      const section_id = req.query.section_id;

      // Validación del parámetro
      if (!section_id || !mongoose.isValidObjectId(section_id)) {
        return res.status(400).json({
          success: false,
          message: "Parámetro section_id inválido",
          detail: section_id,
        });
      }

      const clases = await models.CourseClase.aggregate([
        { $match: { section: new mongoose.Types.ObjectId(section_id) } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "course_clase_files",
            localField: "_id",
            foreignField: "clase",
            as: "files",
          },
        },
        {
          // Proyecta y arma URLs absolutas de archivos; formatea vimeo_id si existe
          $project: {
            _id: 1,
            title: 1,
            description: 1,
            section: 1,
            state: 1,
            time: 1,
            vimeo_id: 1,
            files: {
              $map: {
                input: "$files",
                as: "f",
                in: {
                  _id: "$$f._id",
                  file_name: "$$f.file_name",
                  size: "$$f.size",
                  file: {
                    $concat: [
                      process.env.URL_BACKEND || "",
                      "/api/course_clase/file-clase/",
                      "$$f.file",
                    ],
                  },
                },
              },
            },
          },
        },
        {
          // Agrega URL embebible de vimeo si hay id
          $addFields: {
            vimeo_url: {
              $cond: [
                { $ifNull: ["$vimeo_id", false] },
                { $concat: ["https://player.vimeo.com/video/", "$vimeo_id"] },
                null,
              ],
            },
          },
        },
      ]);

      return res.status(200).json({ success: true, clases });
    } catch (error) {
      console.error("[CourseClaseController.list] error:", error);
      return res.status(500).json({ success: false, message: "Hubo un error" });
    }
  },

  remove: async (req, res) => {
    try {
      const clase_id = req.params["id"];

      // Eliminar archivos asociados a la clase
      const claseFiles = await models.CourseClaseFile.find({ clase: clase_id });
      for (const file of claseFiles) {
        const filePath = path.join(
          __dirname,
          "../uploads/course/files/",
          file.file
        );
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await models.CourseClaseFile.findByIdAndDelete(file._id);
      }

      await models.CourseClase.findByIdAndDelete(clase_id);

      res.status(200).json({
        message: "La clase se elimino correctamente",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Hubo un error",
      });
    }
  },
  upload_vimeo: async (req, res) => {
    try {
      const PathFile = req.files.video.path;
      getVideoDurationInSeconds(PathFile).then(async (duration) => {
        let DURATION = formatarDuracion(duration);
        let VideoMetaDato = {
          name: "Video de la clase",
          description: "El video de la clase seleccionada",
          privacy: {
            view: "anybody",
          },
        };
        let vimeo_id_result = "";
        const result = await UploadVideoVimeo(PathFile, VideoMetaDato);
        if (result.message == 403) {
          res.status(500).send({
            message: "HUBO UN ERROR",
          });
        } else {
          let ARRAY_VALUES = result.value.split("/");
          // /videos/852927231
          // ["","videos","852927231"]
          vimeo_id_result = ARRAY_VALUES[2];
          let Course = await models.CourseClase.findByIdAndUpdate(
            { _id: req.body._id },
            {
              vimeo_id: vimeo_id_result,
              time: DURATION,
            }
          );

          res.status(200).json({
            message: "LA PRUEBA FUE UN EXITO",
            vimeo_id: "https://player.vimeo.com/video/" + vimeo_id_result,
          });
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "HUBO UN ERROR",
      });
    }
  },
  register_file: async (req, res) => {
    try {
      if (req.files && req.files.recurso) {
        const recurso_path = req.files.recurso.path;
        const recurso_name = path.basename(recurso_path);
        req.body.file = recurso_name;
      }
      const ClaseFile = await models.CourseClaseFile.create(req.body);

      res.status(200).json({
        file: {
          _id: ClaseFile._id,
          file:
            process.env.URL_BACKEND +
            "/api/course_clase/file-clase/" +
            ClaseFile.file,
          file_name: ClaseFile.file_name,
          size: ClaseFile.size,
          clase: ClaseFile.clase,
        },
        message: "SE HA REGISTRADO EL RECURSO DESCARGABLE",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  delete_file: async (req, res) => {
    try {
      let file_id = req.params.id;

      const ClaseFile = await models.CourseClaseFile.findById(file_id);
      if (ClaseFile) {
        const filePath = path.join(
          __dirname,
          "../uploads/course/files/",
          ClaseFile.file
        );
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await models.CourseClaseFile.findByIdAndDelete(file_id);
      res.status(200).json({
        message: "SE HA ELIMINADO EL RECURSO DESCARGABLE",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
  get_file_clase: async (req, res) => {
    try {
      const fileT = req.params["file"];
      if (!fileT) {
        res.status(500).send({
          message: "OCURRIO UN PROBLEMA",
        });
      } else {
        fs.stat("./uploads/course/files/" + fileT, function (err) {
          if (!err) {
            let path_img = "./uploads/course/files/" + fileT;
            res.status(200).sendFile(path.resolve(path_img));
          } else {
            let path_img = "./uploads/default.jpg";
            res.status(200).sendFile(path.resolve(path_img));
          }
        });
      }
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN PROBLEMA",
      });
    }
  },
};
