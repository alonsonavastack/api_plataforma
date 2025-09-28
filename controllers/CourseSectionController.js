import models from "../models/index.js";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

export default {
  register: async (req, res) => {
    try {
      // course 1
      // desarrollo del backend
      // course 2
      // desarrollo del backend
      const VALID_SECTION = await models.CourseSection.findOne({
        title: req.body.title,
        course: req.body.course,
      });
      if (VALID_SECTION) {
        res.status(200).json({
          message: 403,
          message_text: "LA SECCIÓN YA EXISTE",
        });
        return;
      }

      const NewSection = await models.CourseSection.create(req.body);

      res.status(200).json({
        section: NewSection,
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
      const VALID_SECTION = await models.CourseSection.findOne({
        title: req.body.title,
        course: req.body.course,
        _id: { $ne: req.body._id },
      });
      if (VALID_SECTION) {
        res.status(200).json({
          message: 403,
          message_text: "LA SECCIÓN YA EXISTE",
        });
        return;
      }

      const NEditCourseSection = await models.CourseSection.findByIdAndUpdate(
        { _id: req.body._id },
        req.body,
        { new: true }
      ); // { new: true } devuelve el documento actualizado

      res.status(200).json({
        section: NEditCourseSection,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Hubo un error",
      });
    }
  },
  // GET /course_section/list?course_id=<ObjectId>
  list: async (req, res) => {
    try {
      const course_id = req.query.course_id;

      // Validación del parámetro
      if (!course_id || !mongoose.isValidObjectId(course_id)) {
        return res.status(400).json({
          success: false,
          message: "Parámetro course_id inválido",
          detail: course_id,
        });
      }

      const sections = await models.CourseSection.aggregate([
        { $match: { course: new mongoose.Types.ObjectId(course_id) } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "course_clases",
            localField: "_id",
            foreignField: "section",
            as: "clases",
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            course: 1,
            state: 1,
            num_clases: { $size: "$clases" },
          },
        },
      ]);

      return res.status(200).json({ success: true, sections });
    } catch (error) {
      console.error("[CourseSectionController.list] error:", error);
      return res.status(500).json({ success: false, message: "Hubo un error" });
    }
  },

  remove: async (req, res) => {
    try {
      const section_id = req.params["id"];

      // Eliminar clases y archivos de clase asociados a la sección
      const clases = await models.CourseClase.find({ section: section_id });
      for (const clase of clases) {
        const claseFiles = await models.CourseClaseFile.find({
          clase: clase._id,
        });
        for (const file of claseFiles) {
          const filePath = path.join(
            __dirname,
            "../uploads/course/files/",
            file.file
          );
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          await models.CourseClaseFile.findByIdAndDelete(file._id);
        }
        await models.CourseClase.findByIdAndDelete(clase._id);
      }

      await models.CourseSection.findByIdAndDelete(section_id);

      res.status(200).json({
        message: "La sección se elimino correctamente",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Hubo un error",
      });
    }
  },
};
