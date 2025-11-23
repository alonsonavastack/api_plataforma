import { Server } from 'socket.io';

let io = null;

/**
 * Inicializa Socket.IO con el servidor HTTP
 * @param {*} server - Servidor HTTP de Express
 */
export function initializeSocketIO(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:4200",
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    console.log('🔌 Socket.IO inicializado correctamente');

    io.on('connection', (socket) => {
        console.log('✅ Cliente conectado:', socket.id);

        // El cliente envía su rol al conectarse
        socket.on('authenticate', (data) => {
            const { userId, role } = data;
            
            if (role === 'admin') {
                socket.join('admins');
                console.log(`👑 Admin ${userId} (${socket.id}) unido a sala de admins`);
            } else if (role === 'instructor') {
                socket.join(`instructor_${userId}`);
                console.log(`👨‍🏫 Instructor ${userId} (${socket.id}) unido a su sala`);
            } else if (role === 'cliente' || role === 'customer') {
                // Clientes también se unen a su sala personal para recibir notificaciones
                socket.join(`instructor_${userId}`); // Reutilizamos el mismo patrón
                console.log(`👨‍💼 Cliente ${userId} (${socket.id}) unido a su sala`);
            }
            
            // Confirmar autenticación
            socket.emit('authenticated', { success: true, role });
        });

        socket.on('disconnect', () => {
            console.log('❌ Cliente desconectado:', socket.id);
        });

        socket.on('error', (error) => {
            console.error('❌ Error en socket:', socket.id, error);
        });
    });

    return io;
}

/**
 * Obtiene la instancia de Socket.IO
 */
export function getIO() {
    if (!io) {
        throw new Error('❌ Socket.IO no ha sido inicializado. Llama a initializeSocketIO() primero.');
    }
    return io;
}

/**
 * Emite una nueva venta a los administradores
 * @param {*} sale - Datos de la venta con usuario poblado
 */
export function emitNewSaleToAdmins(sale) {
    if (!io) {
        console.warn('⚠️  Socket.IO no inicializado, no se puede emitir nueva venta');
        return;
    }

    const saleData = {
        _id: sale._id,
        n_transaccion: sale.n_transaccion,
        total: sale.total,
        currency_total: sale.currency_total,
        status: sale.status,
        createdAt: sale.createdAt,
        user: {
            _id: sale.user._id,
            name: sale.user.name,
            surname: sale.user.surname,
            email: sale.user.email
        }
    };

    io.to('admins').emit('new_sale', saleData);
    console.log('🔔 Nueva venta emitida a admins:', sale._id, '-', sale.n_transaccion);
}

/**
 * Emite actualización de estado de venta
 * @param {*} sale - Venta actualizada con usuario poblado
 */
export function emitSaleStatusUpdate(sale) {
    if (!io) {
        console.warn('⚠️  Socket.IO no inicializado, no se puede emitir actualización');
        return;
    }

    const saleData = {
        _id: sale._id,
        n_transaccion: sale.n_transaccion,
        status: sale.status,
        total: sale.total,
        currency_total: sale.currency_total,
        createdAt: sale.createdAt,
        user: {
            _id: sale.user._id,
            name: sale.user.name,
            surname: sale.user.surname,
            email: sale.user.email
        }
    };

    io.to('admins').emit('sale_status_updated', saleData);
    console.log('🔄 Estado de venta actualizado y emitido a admins:', sale._id, '-', sale.status);
}

/**
 * Emite notificación a un instructor específico
 * @param {string} instructorId - ID del instructor
 * @param {*} data - Datos de la notificación
 */
export function emitToInstructor(instructorId, eventName, data) {
    if (!io) {
        console.warn('⚠️  Socket.IO no inicializado');
        return;
    }

    io.to(`instructor_${instructorId}`).emit(eventName, data);
    console.log(`📢 Evento "${eventName}" emitido al instructor ${instructorId}`);
}

/**
 * Emite una nueva solicitud de reembolso a los administradores
 * @param {*} refund - Datos del reembolso con usuario y venta poblados
 */
export function emitNewRefundRequestToAdmins(refund) {
    if (!io) {
        console.warn('⚠️  Socket.IO no inicializado, no se puede emitir nueva solicitud de reembolso');
        return;
    }

    // 🔥 Construir objeto completo con todos los datos necesarios
    const refundData = {
        _id: refund._id,
        sale: {
            _id: refund.sale._id,
            n_transaccion: refund.sale.n_transaccion,
            total: refund.sale.total
        },
        user: {
            _id: refund.user._id,
            name: refund.user.name,
            surname: refund.user.surname,
            email: refund.user.email
        },
        course: refund.course ? {
            _id: refund.course._id,
            title: refund.course.title
        } : undefined,
        project: refund.project ? {
            _id: refund.project._id,
            title: refund.project.title
        } : undefined,
        reason: refund.reason,
        originalAmount: refund.originalAmount,
        status: refund.status,
        createdAt: refund.createdAt,
        requestedAt: refund.requestedAt
    };

    console.log('📡 [Socket.IO] Emitiendo new_refund_request a sala "admins":', {
        refundId: refundData._id,
        user: `${refundData.user.name} ${refundData.user.surname}`,
        amount: refundData.originalAmount
    });

    io.to('admins').emit('new_refund_request', refundData);
    console.log('✅ [Socket.IO] Evento new_refund_request emitido exitosamente');
}

/**
 * Emite notificación de estado de reembolso a un cliente
 * @param {string} userId - ID del cliente
 * @param {*} refundData - Datos del reembolso
 */
export function emitRefundStatusToClient(userId, refundData) {
    if (!io) {
        console.warn('⚠️  Socket.IO no inicializado, no se puede emitir actualización de reembolso');
        return;
    }

    io.to(`instructor_${userId}`).emit('refund_status_updated', refundData);
    console.log(`🔔 Actualización de reembolso emitida al cliente ${userId}:`, refundData.type);
}
